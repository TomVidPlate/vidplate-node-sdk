import { randomUUID } from 'node:crypto'
import { PipelineApi } from './pipelines.ts'

import { VidPlateError, VidPlateWaitTimeoutError } from './errors.ts'
import {
    DEFAULT_BASE_URL,
    OPERATIONS,
    STATUS_ENUMS,
    type MediaJob,
    type OperationId,
    type OperationInfo,
    type OperationMethods,
    type OperationTypes,
    type PaginatedOperationId,
    type Render,
} from './generated/operations.ts'
import type { RequestOptions } from './options.ts'
import { webhooks } from './webhooks.ts'

export const SDK_VERSION = '0.3.0'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type VidPlateClientOptions = {
    /** A workspace key: vpk_live_... or vpk_test_... */
    apiKey: string
    /** Default https://api.vidplate.app/v1 (the spec's first server). */
    baseUrl?: string
    /** Retries after a 429 (too_many_requests), a 5xx or a network error. Default 3. */
    maxRetries?: number
    /** Per-attempt timeout in milliseconds. Default 60000. */
    timeoutMs?: number
    /** A fetch implementation. Default: the global fetch (Node 18+). */
    fetch?: FetchLike
    /** Longest Retry-After the client will wait for, in seconds. Longer waits fail straight away. Default 60. */
    maxRetryAfterSeconds?: number
    /** Sleep function, injectable for tests. */
    sleep?: (ms: number) => Promise<void>
    /** Makes Idempotency-Keys. Default crypto.randomUUID. */
    idempotencyKeyFactory?: () => string
    /** Sent as User-Agent (ignored by browsers). */
    userAgent?: string
}

export type RawRequest = RequestOptions & {
    method: string
    /** Path below the base URL, for example /renders/rnd_123. */
    path: string
    query?: Record<string, unknown>
    body?: unknown
    /**
     * Allow retries after 5xx and network errors. Default: true for GET, HEAD, PUT, DELETE and OPTIONS, and for any
     * request that carries an Idempotency-Key.
     */
    retryUnsafe?: boolean
}

export type ApiResponse<T> = { data: T; status: number; headers: Headers; requestId: string | null }

type Ops = OperationTypes
export type CallArgs<K extends OperationId> = RequestOptions &
    ([Ops[K]['path']] extends [never] ? { path?: undefined } : { path: Ops[K]['path'] }) &
    ([Ops[K]['query']] extends [never] ? { query?: undefined } : Ops[K]['queryRequired'] extends true ? { query: Ops[K]['query'] } : { query?: Ops[K]['query'] }) &
    ([Ops[K]['body']] extends [never] ? { body?: undefined } : Ops[K]['bodyRequired'] extends true ? { body: Ops[K]['body'] } : { body?: Ops[K]['body'] })

type CallRest<K extends OperationId> = {} extends CallArgs<K> ? [args?: CallArgs<K>] : [args: CallArgs<K>]

export type PageItem<K extends PaginatedOperationId> = Ops[K]['response'] extends { data?: Array<infer T> } ? T : unknown

export type WaitOptions<T> = {
    /** Time between polls. Default 2000 ms. */
    intervalMs?: number
    /** Give up after this long and throw VidPlateWaitTimeoutError. Default 15 minutes. */
    timeoutMs?: number
    /** Called after every poll. */
    onPoll?: (current: T) => void
    signal?: AbortSignal
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'])
/** 429 codes that mean a quota or allowance is used up: waiting a few seconds does not help, so never retried. */
const NON_RETRYABLE_429_CODES = new Set(['quota_exceeded', 'video_minutes_exceeded', 'static_outputs_exceeded'])
/** Statuses that mean "still going". Every other value in the spec's status enum is treated as final. */
const IN_PROGRESS_STATUSES = new Set(['queued', 'pending', 'processing', 'running', 'rendering', 'waiting_for_node', 'waiting_for_input'])

const finalStatuses = (values: readonly string[]) => values.filter((s) => !IN_PROGRESS_STATUSES.has(s) && !s.startsWith('waiting_'))
export const TERMINAL_RENDER_STATUSES: readonly string[] = finalStatuses(STATUS_ENUMS.Render)
export const TERMINAL_MEDIA_JOB_STATUSES: readonly string[] = finalStatuses(STATUS_ENUMS.MediaJob)

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined
    const seconds = Number(value)
    if (Number.isFinite(seconds)) return Math.max(0, seconds)
    const date = Date.parse(value)
    return Number.isNaN(date) ? undefined : Math.max(0, (date - Date.now()) / 1000)
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined) {
    if (!query) return
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue
        const values = Array.isArray(value) ? value : [value]
        for (const v of values) url.searchParams.append(key, v instanceof Date ? v.toISOString() : String(v))
    }
}

/**
 * VidPlate API client. Every operation in the OpenAPI document is a method named after its operationId, for
 * example client.createRender(body), client.getRender(renderId), client.listRenders({ status: 'completed' }).
 */
export class VidPlateClient {
    readonly baseUrl: string
    readonly maxRetries: number
    readonly timeoutMs: number
    readonly webhooks = webhooks
    readonly pipelines = new PipelineApi(this)

    private readonly apiKey: string
    private readonly fetchImpl: FetchLike
    private readonly sleep: (ms: number) => Promise<void>
    private readonly maxRetryAfterSeconds: number
    private readonly newIdempotencyKey: () => string
    private readonly userAgent: string

    constructor(options: VidPlateClientOptions) {
        if (!options || typeof options.apiKey !== 'string' || !options.apiKey.trim()) throw new Error('VidPlateClient needs an apiKey (vpk_live_... or vpk_test_...).')
        this.apiKey = options.apiKey.trim()
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
        this.maxRetries = options.maxRetries ?? 3
        this.timeoutMs = options.timeoutMs ?? 60_000
        const f = options.fetch ?? (globalThis.fetch as FetchLike | undefined)
        if (!f) throw new Error('No fetch available. Use Node 18+ or pass options.fetch.')
        this.fetchImpl = f
        this.sleep = options.sleep ?? defaultSleep
        this.maxRetryAfterSeconds = options.maxRetryAfterSeconds ?? 60
        this.newIdempotencyKey = options.idempotencyKeyFactory ?? randomUUID
        this.userAgent = options.userAgent ?? `vidplate-node/${SDK_VERSION}`

        for (const id of Object.keys(OPERATIONS) as OperationId[]) {
            Object.defineProperty(this, id, {
                value: (...args: unknown[]) => this.invokePositional(id, args),
                enumerable: false,
                writable: true,
                configurable: true,
            })
        }
    }

    /** Calls an operation by operationId with named arguments: { path, query, body, ...options }. */
    call<K extends OperationId>(operationId: K, ...rest: CallRest<K>): Promise<Ops[K]['response']> {
        const args = (rest[0] ?? {}) as RequestOptions & { path?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }
        return this.invoke(operationId, args.path, args.query, args.body, args) as Promise<Ops[K]['response']>
    }

    /** Low-level request. Returns the parsed JSON body. */
    async request<T = unknown>(req: RawRequest): Promise<T> {
        return (await this.requestWithResponse<T>(req)).data
    }

    /** Like request(), but also returns the status, headers and X-Request-Id. */
    async requestWithResponse<T = unknown>(req: RawRequest): Promise<ApiResponse<T>> {
        const method = req.method.toUpperCase()
        const url = new URL(this.baseUrl + (req.path.startsWith('/') ? req.path : `/${req.path}`))
        appendQuery(url, req.query)
        const headers: Record<string, string> = {
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'User-Agent': this.userAgent,
            ...(req.headers ?? {}),
        }
        let payload: string | undefined
        if (req.body !== undefined) {
            headers['Content-Type'] = 'application/json'
            payload = JSON.stringify(req.body)
        }
        if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey
        const retryUnsafe = req.retryUnsafe ?? (SAFE_METHODS.has(method) || Boolean(req.idempotencyKey))
        const maxRetries = req.maxRetries ?? this.maxRetries
        const timeoutMs = req.timeoutMs ?? this.timeoutMs

        for (let attempt = 0; ; attempt++) {
            const canRetry = attempt < maxRetries
            let res: Response
            const controller = new AbortController()
            const onAbort = () => controller.abort(req.signal?.reason)
            if (req.signal?.aborted) throw req.signal.reason ?? new Error('Aborted')
            req.signal?.addEventListener('abort', onAbort, { once: true })
            const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error('timeout')), timeoutMs) : undefined
            try {
                res = await this.fetchImpl(url.toString(), { method, headers, body: payload, signal: controller.signal })
            } catch (cause) {
                if (req.signal?.aborted) throw req.signal.reason ?? cause
                if (canRetry && retryUnsafe) {
                    await this.sleep(this.backoffMs(attempt))
                    continue
                }
                const timedOut = controller.signal.aborted
                const error = new VidPlateError({
                    status: 0,
                    type: timedOut ? 'timeout' : 'connection_error',
                    code: timedOut ? 'request_timeout' : 'connection_failed',
                    message: timedOut ? `No response within ${timeoutMs} ms` : `Could not reach ${this.baseUrl}: ${(cause as Error)?.message ?? cause}`,
                })
                ;(error as { cause?: unknown }).cause = cause
                throw error
            } finally {
                if (timer) clearTimeout(timer)
                req.signal?.removeEventListener('abort', onAbort)
            }

            const requestId = res.headers.get('x-request-id')
            const text = await res.text()
            let data: unknown = undefined
            if (text) {
                try {
                    data = JSON.parse(text)
                } catch {
                    data = text
                }
            }
            if (res.ok) return { data: data as T, status: res.status, headers: res.headers, requestId }

            const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
            const error = VidPlateError.fromResponse(res.status, res.headers, data, retryAfter)
            if (canRetry && res.status === 429 && !NON_RETRYABLE_429_CODES.has(error.code)) {
                if (retryAfter !== undefined && retryAfter > this.maxRetryAfterSeconds) throw error
                await this.sleep(retryAfter !== undefined ? retryAfter * 1000 : this.backoffMs(attempt))
                continue
            }
            if (canRetry && retryUnsafe && (res.status >= 500 || res.status === 408)) {
                const wait = retryAfter !== undefined && retryAfter <= this.maxRetryAfterSeconds ? retryAfter * 1000 : this.backoffMs(attempt)
                await this.sleep(wait)
                continue
            }
            throw error
        }
    }

    /**
     * Iterates every item of a cursor-paginated list, fetching pages as needed:
     *   for await (const render of client.paginate('listRenders', { status: 'completed' })) { ... }
     */
    async *paginate<K extends PaginatedOperationId>(
        operationId: K,
        query?: Ops[K]['query'],
        options: RequestOptions & { path?: Record<string, string>; maxPages?: number } = {},
    ): AsyncGenerator<PageItem<K>, void, undefined> {
        let cursor = (query as { starting_after?: string } | undefined)?.starting_after
        for (let page = 0; options.maxPages === undefined || page < options.maxPages; page++) {
            const q = { ...(query ?? {}), ...(cursor ? { starting_after: cursor } : {}) }
            const result = (await this.invoke(operationId, options.path, q, undefined, options)) as { data?: unknown[]; has_more?: boolean; next_cursor?: string | null }
            for (const item of result?.data ?? []) yield item as PageItem<K>
            if (!result?.has_more || !result.next_cursor) return
            cursor = result.next_cursor
        }
    }

    /** Polls GET /renders/{render_id} until the render reaches a final status, and returns it (completed or not). */
    waitForRender(renderId: string, options: WaitOptions<Render> = {}): Promise<Render> {
        return this.waitFor(() => this.call('getRender', { path: { render_id: renderId }, signal: options.signal }), TERMINAL_RENDER_STATUSES, `render ${renderId}`, options)
    }

    /** Polls GET /media-jobs/{media_job_id} until the job reaches a final status, and returns it. */
    waitForMediaJob(mediaJobId: string, options: WaitOptions<MediaJob> = {}): Promise<MediaJob> {
        return this.waitFor(
            () => this.call('getMediaJob', { path: { media_job_id: mediaJobId }, signal: options.signal }),
            TERMINAL_MEDIA_JOB_STATUSES,
            `media job ${mediaJobId}`,
            options,
        )
    }

    private async waitFor<T extends { status?: string }>(fetchOnce: () => Promise<T>, terminal: readonly string[], label: string, options: WaitOptions<T>): Promise<T> {
        const intervalMs = options.intervalMs ?? 2000
        const deadline = Date.now() + (options.timeoutMs ?? 15 * 60_000)
        for (;;) {
            const current = await fetchOnce()
            options.onPoll?.(current)
            if (current && typeof current.status === 'string' && terminal.includes(current.status)) return current
            if (Date.now() + intervalMs > deadline) throw new VidPlateWaitTimeoutError(`Timed out waiting for ${label} (last status ${current?.status})`, current)
            if (options.signal?.aborted) throw options.signal.reason ?? new Error('Aborted')
            await this.sleep(intervalMs)
        }
    }

    private backoffMs(attempt: number) {
        const base = Math.min(8000, 500 * 2 ** attempt)
        return Math.round(base * (0.5 + Math.random() * 0.5))
    }

    private invokePositional(id: OperationId, args: unknown[]) {
        const info: OperationInfo = OPERATIONS[id]
        const n = info.pathParams.length
        const path: Record<string, unknown> = {}
        info.pathParams.forEach((name, i) => (path[name] = args[i]))
        let body: unknown
        let query: Record<string, unknown> | undefined
        let options: (RequestOptions & { query?: Record<string, unknown> }) | undefined
        if (info.hasBody) {
            body = args[n]
            options = args[n + 1] as typeof options
            query = options?.query
        } else if (info.queryParams.length) {
            query = args[n] as Record<string, unknown> | undefined
            options = args[n + 1] as typeof options
        } else {
            options = args[n] as typeof options
        }
        return this.invoke(id, path, query, body, options ?? {})
    }

    private invoke(id: OperationId, path: Record<string, unknown> | undefined, query: Record<string, unknown> | undefined, body: unknown, options: RequestOptions) {
        const info: OperationInfo = OPERATIONS[id]
        if (!info) throw new Error(`Unknown operation ${id}`)
        const resolvedPath = info.path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
            const value = path?.[name]
            if (value === undefined || value === null || value === '') throw new Error(`${id}: missing path parameter ${name}`)
            return encodeURIComponent(String(value))
        })
        if (info.bodyRequired && body === undefined) throw new Error(`${id}: a request body is required`)
        const idempotencyKey = options.idempotencyKey ?? (info.idempotency !== 'none' ? this.newIdempotencyKey() : undefined)
        return this.request({
            ...options,
            method: info.method,
            path: resolvedPath,
            query,
            body: info.hasBody ? body : undefined,
            idempotencyKey,
        })
    }
}

// Every operation is also a method on the client (added in the constructor from the generated table).
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface VidPlateClient extends OperationMethods {}
