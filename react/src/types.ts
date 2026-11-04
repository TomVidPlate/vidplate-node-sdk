export type Template = {
  id: string; name: string; description?: string | null; kind: 'static' | 'video'; availability: string;
  formats: Record<string, { width: number; height: number; label?: string }>;
  latest_version?: { version: number; status: string } | null;
}
export type TemplateField = {
  name: string; type: string; label: string; description?: string | null; required: boolean; default: unknown;
  placeholder?: string | null; section?: string | null; option_labels?: Record<string, string>;
  constraints: { max_length?: number; min_length?: number; minimum?: number; maximum?: number; step?: number; enum?: string[]; pattern?: string; mime_types?: string[]; max_bytes?: number; max_pixels?: number; max_duration_seconds?: number; [key: string]: unknown };
}
export type TemplateDefinition = {
  template_id: string; version: number; schema_hash: string; kind: 'static' | 'video'; status: string; fields: TemplateField[];
  formats: Template['formats']; durations_seconds: number[];
}
export type FieldValue = string | number | boolean | { upload_id: string };
export type RenderRequest = { template_id: string; template_version: number; fields: Record<string, FieldValue>; outputs: Array<{ format: string; duration_seconds?: number }> };
export type RenderOutput = { id: string; status: string; format?: string; file_name?: string | null; download_url?: string | null; file_available?: boolean; mime_type?: string; failure_code?: string };
export type Render = { id: string; status: string; waiting_reason?: string; progress?: { percent?: number }; outputs?: RenderOutput[] };
export type ListResult = { data: Template[]; has_more: boolean; next_cursor: string | null };
export type UploadContext = { template_id: string; template_version: number; field: string };
/** Implement these on your server. Never pass a VidPlate secret key to a browser component. */
export interface OrderTransport {
  listTemplates(options: { cursor?: string; signal?: AbortSignal }): Promise<ListResult>;
  getDefinition(templateId: string, signal?: AbortSignal): Promise<TemplateDefinition>;
  upload(file: File, context: UploadContext, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<{ upload_id: string }>;
  createRender(request: RenderRequest, idempotencyKey: string, signal?: AbortSignal): Promise<Render>;
  getRender(id: string, signal?: AbortSignal): Promise<Render>;
  getOutputs(id: string, signal?: AbortSignal): Promise<{ data: RenderOutput[] }>;
}
