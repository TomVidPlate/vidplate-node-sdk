/** Per-call options, accepted as the last argument of every operation method. */
export type RequestOptions = {
    /**
     * Idempotency-Key to send. Operations that accept one get a random UUID when you leave this out, and the same
     * key is reused on every retry of that call. Pass your own (for example an order ID) to make retries across
     * process restarts safe too.
     */
    idempotencyKey?: string
    /** Extra request headers. */
    headers?: Record<string, string>
    /** Abort the call (and any retries). */
    signal?: AbortSignal
    /** Per-attempt timeout in milliseconds. Defaults to the client's timeoutMs. */
    timeoutMs?: number
    /** Retries for this call. Defaults to the client's maxRetries. */
    maxRetries?: number
}
