import type { FieldValue, TemplateDefinition, TemplateField } from './types.js'
const media = new Set(['image', 'video', 'audio', 'file', 'model', 'model3d', '3dModel'])
export const isMediaField = (field: TemplateField) => media.has(field.type)
export const isSupportedField = (field: TemplateField) => isMediaField(field) || ['text','textArea','textarea','url','colour','color','dropdown','checkbox','number'].includes(field.type)
export function initialValues(definition: TemplateDefinition): Record<string, FieldValue> {
  return Object.fromEntries(definition.fields.filter(field => field.default !== null && field.default !== undefined && !isMediaField(field)).map(field => [field.name, field.default as FieldValue]))
}
export function validateValues(definition: TemplateDefinition, values: Record<string, FieldValue>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of definition.fields) {
    const value = values[field.name], c = field.constraints
    if (!isSupportedField(field)) { errors[field.name] = 'This field needs a custom control. Contact your developer.'; continue }
    if (value === undefined || value === '') { if (field.required) errors[field.name] = `${field.label} is required.`; continue }
    if (isMediaField(field)) { if (typeof value !== 'object' || !/^upl_/.test(value.upload_id)) errors[field.name] = 'Upload a file first.'; continue }
    if (field.type === 'number') {
      const number = typeof value === 'number' ? value : Number.NaN
      if (!Number.isFinite(number)) errors[field.name] = 'Enter a number.'
      else if (c.minimum !== undefined && number < c.minimum) errors[field.name] = `Use ${c.minimum} or more.`
      else if (c.maximum !== undefined && number > c.maximum) errors[field.name] = `Use ${c.maximum} or less.`
    } else if (field.type === 'checkbox') { if (typeof value !== 'boolean') errors[field.name] = 'Choose a valid option.' }
    else if (typeof value !== 'string') errors[field.name] = 'Enter text.'
    else {
      const length = Array.from(value).length
      if (c.max_length !== undefined && length > c.max_length) errors[field.name] = `Use ${c.max_length} characters or fewer.`
      else if (c.min_length !== undefined && length < c.min_length) errors[field.name] = `Use at least ${c.min_length} characters.`
      else if (c.enum && !c.enum.includes(value)) errors[field.name] = 'Choose an available option.'
      else if (field.type === 'url') { try { if (!['http:','https:'].includes(new URL(value).protocol)) throw Error() } catch { errors[field.name] = 'Use an http or https URL.' } }
      else if (['colour','color'].includes(field.type) && !/^#[0-9a-f]{6}$/i.test(value)) errors[field.name] = 'Use a six-digit hex colour.'
      else if (c.pattern) { try { if (!new RegExp(c.pattern, 'u').test(value)) errors[field.name] = 'This value does not match the required format.' } catch { errors[field.name] = 'This field needs a custom validator.' } }
    }
  }
  return errors
}
export function fileContentType(file: { type:string; name?:string }): string {
  if(file.type)return file.type
  return ({glb:'model/gltf-binary',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg'} as Record<string,string>)[file.name?.split('.').pop()?.toLowerCase()||'']||''
}
export function validateFile(field: TemplateField, file: Pick<File, 'size' | 'type'> & { name?:string }): string | null {
  if (!file.size) return 'Choose a non-empty file.'
  if (field.constraints.max_bytes && file.size > field.constraints.max_bytes) return `Maximum file size: ${Math.round(field.constraints.max_bytes / 1048576)} MB.`
  if (field.constraints.mime_types?.length && !field.constraints.mime_types.includes(fileContentType(file))) return 'Choose one of the supported file types.'
  return null
}
export function fieldsForRequest(definition: TemplateDefinition, values: Record<string, FieldValue>) {
  return Object.fromEntries(definition.fields.filter(field => values[field.name] !== undefined && values[field.name] !== '').map(field => [field.name, values[field.name]]))
}
