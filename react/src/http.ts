import type { OrderTransport, RenderRequest } from './types.js'
import { fileContentType } from './form.js'
export class OrderApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public requestId?: string) { super(message); this.name = 'OrderApiError' }
}
export function createHttpTransport({ basePath = '/api/vidplate' }: { basePath?: string } = {}): OrderTransport {
  if (!basePath.startsWith('/') || basePath.startsWith('//')) throw Error('Use a same-origin backend path, not the VidPlate API URL.')
  const base = basePath.replace(/\/$/, '')
  async function request<T>(path: string, body?: unknown, signal?: AbortSignal, key?: string): Promise<T> {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new OrderApiError(data.error?.message || `Request failed (${response.status}).`, response.status, data.error?.code, data.error?.request_id)
    return data as T
  }
  return {
    listTemplates: ({ cursor, signal }) => request(`/templates${cursor ? `?starting_after=${encodeURIComponent(cursor)}` : ''}`, undefined, signal),
    getDefinition: (id, signal) => request(`/templates/${encodeURIComponent(id)}`, undefined, signal),
    createRender: (body: RenderRequest, key, signal) => request('/renders', body, signal, key),
    getRender: (id, signal) => request(`/renders/${encodeURIComponent(id)}`, undefined, signal),
    getOutputs: (id, signal) => request(`/renders/${encodeURIComponent(id)}/outputs`, undefined, signal),
    async upload(file, context, onProgress, signal) {
      const upload = await request<{ id: string; upload: { url: string; headers: Record<string,string> } }>('/uploads', { ...context, filename: file.name, content_type: fileContentType(file), size_bytes: file.size }, signal)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const abort = () => { xhr.abort(); reject(new DOMException('Upload cancelled', 'AbortError')) }
        if (signal?.aborted) { abort(); return }
        signal?.addEventListener('abort', abort, { once: true })
        xhr.open('PUT', upload.upload.url)
        for (const [name, value] of Object.entries(upload.upload.headers || {})) if (!['content-length','host','cookie','authorization'].includes(name.toLowerCase())) xhr.setRequestHeader(name, value)
        xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)) }
        xhr.onload = () => { signal?.removeEventListener('abort', abort); xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new OrderApiError('The file could not be uploaded. Try again.', xhr.status)) }
        xhr.onerror = () => { signal?.removeEventListener('abort', abort); reject(new OrderApiError('Upload connection failed. Try again.', 0)) }
        xhr.send(file)
      })
      await request(`/uploads/${encodeURIComponent(upload.id)}/complete`, {}, signal)
      return { upload_id: upload.id }
    },
  }
}
