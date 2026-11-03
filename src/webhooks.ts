import { createHmac, timingSafeEqual } from 'node:crypto'

import { VidPlateSignatureError } from './errors.ts'
import type { WebhookEvent } from './generated/operations.ts'

/*
    VidPlate-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "{t}.{raw body}" keyed with the endpoint secret>

    During a secret rotation the header carries two v1= values (new and previous secret) for 24 hours. This matches
    the server's own check: parse t and every v1, reject a t outside the tolerance, then compare in constant time.
*/

export const SIGNATURE_HEADER = 'VidPlate-Signature'
export const DEFAULT_TOLERANCE_SECONDS = 300

export type WebhookVerifyOptions = {
    /** Largest allowed gap between the header's t and now, in seconds. Default 300. */
    toleranceSeconds?: number
    /** Override "now" (unix seconds), for tests. */
    nowSeconds?: number
}

export type WebhookVerifyResult =
    | { valid: true; timestamp: number }
    | { valid: false; reason: 'malformed_header' | 'timestamp_out_of_tolerance' | 'signature_mismatch' }

type RawBody = string | Uint8Array

function hmacHex(secret: string, timestamp: number, rawBody: RawBody) {
    const mac = createHmac('sha256', secret)
    mac.update(`${timestamp}.`, 'utf8')
    if (typeof rawBody === 'string') mac.update(rawBody, 'utf8')
    else mac.update(rawBody)
    return mac.digest('hex')
}

export function parseSignatureHeader(header: string | string[] | null | undefined) {
    const value = Array.isArray(header) ? header.join(',') : String(header ?? '')
    let timestamp: number | null = null
    const signatures: string[] = []
    for (const part of value.split(',')) {
        const [name, ...rest] = part.trim().split('=')
        const v = rest.join('=')
        if (name === 't' && /^\d{1,12}$/.test(v)) timestamp = Number(v)
        if (name === 'v1' && /^[0-9a-f]{64}$/i.test(v)) signatures.push(v.toLowerCase())
    }
    return { timestamp, signatures }
}

/**
 * Checks a delivery. Pass the raw request body exactly as received (before any JSON parsing). `secret` may be a
 * list, for example while you switch to a rotated secret.
 */
export function verifyWebhook(
    rawBody: RawBody,
    signatureHeader: string | string[] | null | undefined,
    secret: string | string[],
    options: WebhookVerifyOptions = {},
): WebhookVerifyResult {
    const { timestamp, signatures } = parseSignatureHeader(signatureHeader)
    if (timestamp === null || signatures.length === 0) return { valid: false, reason: 'malformed_header' }
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
    const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
    if (Math.abs(now - timestamp) > tolerance) return { valid: false, reason: 'timestamp_out_of_tolerance' }
    const secrets = (Array.isArray(secret) ? secret : [secret]).filter(Boolean)
    for (const s of secrets) {
        const expected = Buffer.from(hmacHex(s, timestamp, rawBody), 'hex')
        const match = signatures.some((sig) => {
            const candidate = Buffer.from(sig, 'hex')
            return candidate.length === expected.length && timingSafeEqual(candidate, expected)
        })
        if (match) return { valid: true, timestamp }
    }
    return { valid: false, reason: 'signature_mismatch' }
}

/** Verifies the delivery and returns the parsed event, or throws VidPlateSignatureError. */
export function constructWebhookEvent(
    rawBody: RawBody,
    signatureHeader: string | string[] | null | undefined,
    secret: string | string[],
    options: WebhookVerifyOptions = {},
): WebhookEvent {
    const result = verifyWebhook(rawBody, signatureHeader, secret, options)
    if (!result.valid) throw new VidPlateSignatureError(result.reason)
    const text = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8')
    return JSON.parse(text) as WebhookEvent
}

/** Builds a header value the way VidPlate does. Useful for testing your own handler. */
export function signWebhookPayload(rawBody: RawBody, secret: string | string[], timestamp = Math.floor(Date.now() / 1000)) {
    const secrets = (Array.isArray(secret) ? secret : [secret]).filter(Boolean)
    return [`t=${timestamp}`, ...secrets.map((s) => `v1=${hmacHex(s, timestamp, rawBody)}`)].join(',')
}

export const webhooks = {
    verify: verifyWebhook,
    constructEvent: constructWebhookEvent,
    parseHeader: parseSignatureHeader,
    sign: signWebhookPayload,
    SIGNATURE_HEADER,
}
