export type ApiErrorDetail = { param?: string; code?: string; message?: string }

type ErrorInit = {
    status: number
    type: string
    code: string
    message: string
    param?: string
    errors?: ApiErrorDetail[]
    requestId?: string
    headers?: Headers
    body?: unknown
    retryAfterSeconds?: number
}

/**
 * Any failed call. `status` is the HTTP status (0 when no response arrived: network error or timeout), `type` and
 * `code` come from the API's error body, and `requestId` is the X-Request-Id to quote when asking for help.
 */
export class VidPlateError extends Error {
    readonly status: number
    readonly type: string
    readonly code: string
    readonly param?: string
    readonly errors?: ApiErrorDetail[]
    readonly requestId?: string
    readonly headers?: Headers
    readonly body?: unknown
    readonly retryAfterSeconds?: number

    constructor(init: ErrorInit) {
        const suffix = [init.status ? `status ${init.status}` : '', init.code ? `code ${init.code}` : '', init.requestId ? `request ${init.requestId}` : '']
            .filter(Boolean)
            .join(', ')
        super(suffix ? `${init.message} (${suffix})` : init.message)
        this.name = 'VidPlateError'
        this.status = init.status
        this.type = init.type
        this.code = init.code
        this.param = init.param
        this.errors = init.errors
        this.requestId = init.requestId
        this.headers = init.headers
        this.body = init.body
        this.retryAfterSeconds = init.retryAfterSeconds
    }

    /** Builds the error from a non-2xx response and its parsed body. */
    static fromResponse(status: number, headers: Headers, body: unknown, retryAfterSeconds?: number): VidPlateError {
        const err = body && typeof body === 'object' ? (body as { error?: Record<string, unknown> }).error : undefined
        const requestId = (typeof err?.request_id === 'string' ? err.request_id : undefined) ?? headers.get('x-request-id') ?? undefined
        return new VidPlateError({
            status,
            type: typeof err?.type === 'string' ? err.type : status >= 500 ? 'api_error' : 'invalid_request',
            code: typeof err?.code === 'string' ? err.code : `http_${status}`,
            message: typeof err?.message === 'string' ? err.message : `HTTP ${status}`,
            param: typeof err?.param === 'string' ? err.param : undefined,
            errors: Array.isArray(err?.errors) ? (err.errors as ApiErrorDetail[]) : undefined,
            requestId,
            headers,
            body,
            retryAfterSeconds,
        })
    }
}

/** waitForRender / waitForMediaJob gave up before a final status. `last` is the last object seen. */
export class VidPlateWaitTimeoutError extends Error {
    readonly last: unknown

    constructor(message: string, last: unknown) {
        super(message)
        this.name = 'VidPlateWaitTimeoutError'
        this.last = last
    }
}

/** webhooks.constructEvent could not verify the VidPlate-Signature header. */
export class VidPlateSignatureError extends Error {
    readonly reason: string

    constructor(reason: string) {
        super(`Webhook signature verification failed: ${reason}`)
        this.name = 'VidPlateSignatureError'
        this.reason = reason
    }
}
