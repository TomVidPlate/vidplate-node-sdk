import { randomUUID } from 'node:crypto'
import type { VidPlateClient } from './client.ts'
import type { RequestOptions } from './options.ts'
import type { CreateMediaJobBody, MediaJob } from './generated/operations.ts'

export type PipelineOutputReference = { step: string; output: string }
export type PipelineStep = {
    id: string
    request: Omit<CreateMediaJobBody, 'inputs'> & { inputs: Array<CreateMediaJobBody['inputs'][number] | PipelineOutputReference> }
    /** Named output to zero-based output index. */
    outputs: Record<string, number>
}
export type PipelineRequest = { steps: PipelineStep[]; deliverables: Record<string, PipelineOutputReference> }
export type PipelineStatus = 'creating' | 'running' | 'completed' | 'partially_completed' | 'failed' | 'cancelled' | 'submission_failed'
export type Pipeline = {
    object: 'pipeline'; id: string; status: PipelineStatus; created_at: string
    steps: Array<{ id: string; media_job_id: string | null; status: string; fused_into?: string | null; outputs: Record<string, NonNullable<MediaJob['outputs']>[number] | null> }>
    progress: { completed: number; total: number; percent: number }
    deliverables: Record<string, NonNullable<MediaJob['outputs']>[number] | null>
    error?: { code: string; message: string }
}
/** Pipeline availability depends on the workspace and server configuration. */
export class PipelineApi {
    private readonly client: VidPlateClient
    constructor(client: VidPlateClient) { this.client = client }
    estimate(body: PipelineRequest, options: RequestOptions = {}) {
        return this.client.request<{ object: 'pipeline_estimate'; valid: boolean; renders: number; video_seconds_requested: number; output_count: number; warnings: string[] }>({ ...options, method: 'POST', path: '/pipelines/estimate', body })
    }
    create(body: PipelineRequest, options: RequestOptions = {}) {
        return this.client.request<Pipeline>({ ...options, idempotencyKey: options.idempotencyKey || randomUUID(), method: 'POST', path: '/pipelines', body })
    }
    get(id: string, options: RequestOptions = {}) { return this.client.request<Pipeline>({ ...options, method: 'GET', path: `/pipelines/${encodeURIComponent(id)}` }) }
    outputs(id: string, options: RequestOptions & { expiresIn?: number } = {}) {
        return this.client.request<{ object: 'pipeline_outputs'; id: string; outputs: Record<string, Record<string, unknown> | null> }>({ ...options, method: 'GET', path: `/pipelines/${encodeURIComponent(id)}/outputs`, query: { expires_in: options.expiresIn } })
    }
    cancel(id: string, options: RequestOptions = {}) { return this.client.request<Pipeline>({ ...options, idempotencyKey: options.idempotencyKey || randomUUID(), method: 'POST', path: `/pipelines/${encodeURIComponent(id)}/cancel`, body: {} }) }
    retry(id: string, options: RequestOptions = {}) { return this.client.request<Pipeline & { retries: Array<{ step: string; retried: boolean; code?: string }> }>({ ...options, idempotencyKey: options.idempotencyKey || randomUUID(), method: 'POST', path: `/pipelines/${encodeURIComponent(id)}/retry`, body: {} }) }
}
