import assert from 'node:assert/strict'
import { test } from 'node:test'

import { OPERATIONS, TERMINAL_RENDER_STATUSES, VidPlateClient, VidPlateError, webhooks } from '../src/index.ts'

type Call = { url: string; init: RequestInit; headers: Record<string, string> }

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'x-request-id': `req_${status}`, ...headers },
    })
}

/** A fetch that answers from a queue of responses and records every request. */
function mockFetch(responses: Array<Response | (() => Response)>) {
    const calls: Call[] = []
    const fetch = async (url: string, init: RequestInit) => {
        calls.push({ url, init, headers: { ...(init.headers as Record<string, string>) } })
        const next = responses.shift()
        if (!next) throw new Error(`Unexpected request ${init.method} ${url}`)
        return typeof next === 'function' ? next() : next
    }
    return { fetch, calls }
}

function client(fetch: ReturnType<typeof mockFetch>['fetch'], sleeps: number[] = []) {
    return new VidPlateClient({
        apiKey: 'vpk_test_abc123',
        fetch,
        sleep: async (ms) => {
            sleeps.push(ms)
        },
    })
}

const RENDER = { object: 'render', id: 'rnd_1', status: 'queued' }

test('generated table covers the spec', () => {
    assert.ok(Object.keys(OPERATIONS).length >= 30)
    assert.equal(OPERATIONS.createRender.method, 'POST')
    assert.equal(OPERATIONS.createRender.idempotency, 'required')
    assert.deepEqual([...OPERATIONS.getRender.pathParams], ['render_id'])
    assert.ok(TERMINAL_RENDER_STATUSES.includes('completed'))
    assert.ok(!TERMINAL_RENDER_STATUSES.includes('rendering'))
})

test('sends the bearer key, base URL and path params', async () => {
    const m = mockFetch([json(200, RENDER)])
    const render = await client(m.fetch).getRender('rnd_1')
    assert.equal(render.id, 'rnd_1')
    assert.equal(m.calls[0].url, 'https://api.vidplate.app/v1/renders/rnd_1')
    assert.equal(m.calls[0].init.method, 'GET')
    assert.equal(m.calls[0].headers.Authorization, 'Bearer vpk_test_abc123')
    assert.equal(m.calls[0].headers['Idempotency-Key'], undefined)
})

test('POST gets an Idempotency-Key, reused on a 429 retry that honours Retry-After', async () => {
    const sleeps: number[] = []
    const m = mockFetch([json(429, { error: { type: 'rate_limited', code: 'too_many_requests', message: 'Slow down', request_id: 'req_a' } }, { 'retry-after': '2' }), json(202, RENDER)])
    const render = await client(m.fetch, sleeps).createRender({ template_id: 'tpl_1', outputs: [{ format: 'feed_4x5' }] })
    assert.equal(render.status, 'queued')
    assert.equal(m.calls.length, 2)
    const key = m.calls[0].headers['Idempotency-Key']
    assert.match(key, /^[0-9a-f-]{36}$/)
    assert.equal(m.calls[1].headers['Idempotency-Key'], key)
    assert.deepEqual(sleeps, [2000])
    assert.equal(m.calls[0].headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(String(m.calls[0].init.body)), { template_id: 'tpl_1', outputs: [{ format: 'feed_4x5' }] })
})

test('caller Idempotency-Key wins and 5xx retries reuse it', async () => {
    const sleeps: number[] = []
    const m = mockFetch([json(503, { error: { type: 'service_unavailable', code: 'unavailable', message: 'x', request_id: 'r' } }), json(202, RENDER)])
    await client(m.fetch, sleeps).call('createRender', { body: { template_id: 'tpl_1', outputs: [{ format: 'a' }] }, idempotencyKey: 'order-42' })
    assert.equal(m.calls[0].headers['Idempotency-Key'], 'order-42')
    assert.equal(m.calls[1].headers['Idempotency-Key'], 'order-42')
    assert.equal(sleeps.length, 1)
})

test('quota 429s are not retried', async () => {
    const m = mockFetch([json(429, { error: { type: 'rate_limited', code: 'video_minutes_exceeded', message: 'Used up', request_id: 'r' } }, { 'retry-after': '3600' })])
    await assert.rejects(client(m.fetch).createRender({ template_id: 'tpl_1', outputs: [{ format: 'a' }] }), (e: unknown) => e instanceof VidPlateError && e.code === 'video_minutes_exceeded')
    assert.equal(m.calls.length, 1)
})

test('maps API errors to VidPlateError', async () => {
    const m = mockFetch([
        json(
            404,
            { error: { type: 'not_found', code: 'render_not_found', message: 'No such render', param: 'render_id', request_id: 'req_body' } },
            { 'x-request-id': 'req_header' },
        ),
    ])
    const err = await client(m.fetch)
        .getRender('rnd_missing')
        .then(() => null, (e) => e)
    assert.ok(err instanceof VidPlateError)
    assert.equal(err.status, 404)
    assert.equal(err.type, 'not_found')
    assert.equal(err.code, 'render_not_found')
    assert.equal(err.param, 'render_id')
    assert.equal(err.requestId, 'req_body')
    assert.equal(m.calls.length, 1)
})

test('paginate follows next_cursor across two pages', async () => {
    const m = mockFetch([
        json(200, { object: 'list', data: [{ id: 'rnd_1' }, { id: 'rnd_2' }], has_more: true, next_cursor: 'rnd_2' }),
        json(200, { object: 'list', data: [{ id: 'rnd_3' }], has_more: false, next_cursor: null }),
    ])
    const ids: string[] = []
    for await (const render of client(m.fetch).paginate('listRenders', { status: 'completed', limit: 2 })) ids.push(render.id as string)
    assert.deepEqual(ids, ['rnd_1', 'rnd_2', 'rnd_3'])
    const second = new URL(m.calls[1].url)
    assert.equal(second.searchParams.get('starting_after'), 'rnd_2')
    assert.equal(second.searchParams.get('status'), 'completed')
    assert.equal(new URL(m.calls[0].url).searchParams.get('starting_after'), null)
})

test('waitForRender polls until a final status', async () => {
    const sleeps: number[] = []
    const m = mockFetch([json(200, { ...RENDER, status: 'rendering' }), json(200, { ...RENDER, status: 'completed' })])
    const render = await client(m.fetch, sleeps).waitForRender('rnd_1', { intervalMs: 5 })
    assert.equal(render.status, 'completed')
    assert.deepEqual(sleeps, [5])
})

test('webhook verify: valid, rotated, tampered and stale', () => {
    const secret = 'whsec_test_secret'
    const body = JSON.stringify({ id: 'evt_1', type: 'render.completed', api_version: 'v1', data: { render_id: 'rnd_1' } })
    const now = 1_762_074_400
    const header = webhooks.sign(body, secret, now)

    assert.deepEqual(webhooks.verify(body, header, secret, { nowSeconds: now }), { valid: true, timestamp: now })
    assert.equal(webhooks.verify(Buffer.from(body), header, secret, { nowSeconds: now + 10 }).valid, true)
    // Rotation: header signed with the new and the previous secret, receiver still on the previous one.
    assert.equal(webhooks.verify(body, webhooks.sign(body, ['whsec_new', secret], now), secret, { nowSeconds: now }).valid, true)

    assert.deepEqual(webhooks.verify(body.replace('rnd_1', 'rnd_2'), header, secret, { nowSeconds: now }), { valid: false, reason: 'signature_mismatch' })
    assert.deepEqual(webhooks.verify(body, header, 'whsec_wrong', { nowSeconds: now }), { valid: false, reason: 'signature_mismatch' })
    assert.deepEqual(webhooks.verify(body, header, secret, { nowSeconds: now + 301 }), { valid: false, reason: 'timestamp_out_of_tolerance' })
    assert.deepEqual(webhooks.verify(body, 'garbage', secret), { valid: false, reason: 'malformed_header' })

    const event = webhooks.constructEvent(body, header, secret, { nowSeconds: now })
    assert.equal(event.type, 'render.completed')
    assert.throws(() => webhooks.constructEvent(body + ' ', header, secret, { nowSeconds: now }), /signature_mismatch/)
})
