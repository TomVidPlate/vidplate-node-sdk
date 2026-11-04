/** Server-only HTTP gateway for the React components. API keys never enter a client response. */
import { createHash } from 'node:crypto'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { validateFile, validateValues } from './form.js'
import type { Render, RenderRequest, TemplateDefinition, TemplateField } from './types.js'

export type OrderAccess = { principal: string; apiKey: string; templateIds?: string[] }
export type OwnedResource = { kind: 'upload' | 'render'; templateId?: string; version?: number; field?: string; ready?: boolean }
export interface OwnershipStore { get(key: string): Promise<OwnedResource | null>; set(key: string, resource: OwnedResource, ttlSeconds: number): Promise<void> }
/** Development/single-process store. Replace with a shared durable store before multi-instance deployment. */
export function createMemoryOwnershipStore({ maxEntries = 5000 }: { maxEntries?: number } = {}): OwnershipStore {
  const entries = new Map<string,{resource:OwnedResource;expires:number}>()
  return {
    async get(key){const value=entries.get(key);if(!value||value.expires<Date.now()){entries.delete(key);return null}return value.resource},
    async set(key,resource,ttl){for(const [id,value]of entries)if(value.expires<Date.now())entries.delete(id);if(!entries.has(key)&&entries.size>=maxEntries)throw new GatewayError(503,'store_full','The order service is busy. Try again later.');entries.set(key,{resource,expires:Date.now()+ttl*1000})},
  }
}
export type OrderGatewayOptions = {
  /** Resolve your own authenticated user and tenant key. Return null for unauthenticated requests. */
  authorize(request: Request): Promise<OrderAccess | null>;
  store: OwnershipStore;
  basePath?: string;
  /** Trusted server configuration only, never taken from a request. */
  apiBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
  allowedOrigin?: string;
  /** Add durable per-user limits for paid actions in a distributed production app. */
  rateLimit?(access: OrderAccess, write: boolean): Promise<boolean>;
}
class GatewayError extends Error { constructor(public status:number,public code:string,message:string,public requestId?:string){super(message)} }
const validTemplate=(value:unknown):value is string=>typeof value==='string'&&/^tpl_[a-f0-9]{24}$/i.test(value)
const validVersion=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
function fail(status:number,code:string,message:string):never{throw new GatewayError(status,code,message)}
async function jsonBody(request:Request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'json_required','Send JSON to this endpoint.')
  const reader=request.body?.getReader();if(!reader)fail(400,'invalid_body','A request body is required.')
  const chunks:Uint8Array[]=[];let length=0
  for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>65536){await reader.cancel();fail(413,'body_too_large','Form requests are limited to 64 KB.')}chunks.push(chunk.value)}
  try{const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}const body=JSON.parse(new TextDecoder().decode(bytes));if(!record(body))throw Error();return body}catch{fail(400,'invalid_body','Send a JSON object.')}
}
export function createOrderGateway(options:OrderGatewayOptions){
  if(typeof window!=='undefined')throw Error('The order gateway must only run on your server.')
  const basePath=(options.basePath||'/api/vidplate').replace(/\/$/,''),apiBase=(options.apiBaseUrl||'https://api.vidplate.app/v1').replace(/\/$/,'')
  const doFetch=options.fetch||globalThis.fetch
  return async function handle(request:Request):Promise<Response>{
    const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff'}})
    try{
      const access=await options.authorize(request)
      if(!access?.principal||!access.apiKey)fail(401,'authentication_required','Sign in to create content.')
      const write=request.method==='POST',url=new URL(request.url)
      if(!['GET','POST'].includes(request.method))fail(405,'method_not_allowed','Use GET or POST.')
      if(write&&request.headers.get('origin')!==(options.allowedOrigin||url.origin))fail(403,'origin_not_allowed','This request must come from your platform.')
      if(options.rateLimit&&!await options.rateLimit(access,write))fail(429,'order_rate_limited','Too many requests. Please wait a minute.')
      const scope=createHash('sha256').update(access.principal+'\0'+access.apiKey).digest('hex')
      const ownerKey=(id:string)=>scope+':'+id
      const checkTemplate=(id:unknown)=>{if(!validTemplate(id)||access.templateIds&&!access.templateIds.includes(id))fail(404,'template_not_found','This template is not available.')}
      async function api<T=Record<string,any>>(path:string,body?:unknown,key?:string):Promise<T>{
        const result=await doFetch(apiBase+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+access!.apiKey,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000),cache:'no-store'})
        const data=await result.json().catch(()=>({})) as Record<string,any>
        if(!result.ok)throw new GatewayError(result.status,data.error?.code||'upstream_error',data.error?.message||'VidPlate could not complete this request.',data.error?.request_id)
        return data as T
      }
      async function definition(id:string,version:number|'latest'='latest'):Promise<TemplateDefinition>{
        checkTemplate(id)
        const contract=await api<TemplateDefinition>(`/templates/by-code/${id}/fields?version=${version}`)
        const detail=await api<Pick<TemplateDefinition,'formats'|'durations_seconds'>>(`/templates/${id}/versions/${contract.version}`)
        return {...contract,formats:detail.formats||{},durations_seconds:detail.durations_seconds||[]}
      }
      if(!url.pathname.startsWith(basePath+'/'))fail(404,'not_found','Endpoint not found.')
      const path=url.pathname.slice(basePath.length)
      if(path==='/templates'&&!write){
        const cursor=url.searchParams.get('starting_after');if(cursor&&!validTemplate(cursor))fail(400,'invalid_cursor','Invalid page cursor.')
        const result=await api<{data:Array<{id:string}>;has_more:boolean;next_cursor:string|null}>('/templates?limit=40'+(cursor?'&starting_after='+encodeURIComponent(cursor):''))
        return reply({...result,data:access.templateIds?result.data.filter(template=>access.templateIds!.includes(template.id)):result.data})
      }
      const template=path.match(/^\/templates\/(tpl_[a-f0-9]{24})$/i)
      if(template&&!write)return reply(await definition(template[1]))
      if(path==='/uploads'&&write){
        const body=await jsonBody(request);checkTemplate(body.template_id)
        if(!validVersion(body.template_version)||typeof body.field!=='string'||typeof body.filename!=='string'||body.filename.length>200||typeof body.content_type!=='string'||!Number.isSafeInteger(body.size_bytes)||Number(body.size_bytes)<=0)fail(400,'invalid_upload','Choose a valid file and template field.')
        const contract=await definition(body.template_id as string,body.template_version)
        const field=contract.fields.find(field=>field.name===body.field)
        if(!field)fail(400,'unknown_field','This file field is not available.')
        const fileError=validateFile(field,{type:body.content_type,size:Number(body.size_bytes)})
        if(fileError)fail(422,'invalid_file',fileError)
        if(!['image','video','audio','file','model','model3d','3dModel'].includes(field.type))fail(400,'wrong_field_type','This field does not accept files.')
        const upload=await api<{id:string}>('/uploads',{filename:body.filename,content_type:body.content_type,size_bytes:body.size_bytes})
        await options.store.set(ownerKey(upload.id),{kind:'upload',templateId:body.template_id as string,version:body.template_version,field:body.field,ready:false},7*86400)
        return reply(upload,201)
      }
      const complete=path.match(/^\/uploads\/(upl_[a-f0-9]{24})\/complete$/i)
      if(complete&&write){
        const owned=await options.store.get(ownerKey(complete[1]));if(owned?.kind!=='upload')fail(404,'upload_not_found','This upload is not available.')
        const result=await api(`/uploads/${complete[1]}/complete`,{})
        await options.store.set(ownerKey(complete[1]),{...owned,ready:true},7*86400);return reply(result)
      }
      if(path==='/renders'&&write){
        const body=await jsonBody(request);checkTemplate(body.template_id)
        if(!validVersion(body.template_version)||!record(body.fields)||!Array.isArray(body.outputs)||Object.keys(body).some(key=>!['template_id','template_version','fields','outputs'].includes(key)))fail(400,'invalid_render','Supply the pinned template version, fields and output sizes.')
        const key=request.headers.get('idempotency-key');if(!key||!/^[a-z0-9_-]{16,128}$/i.test(key))fail(400,'idempotency_required','A valid idempotency key is required.')
        const contract=await definition(body.template_id as string,body.template_version)
        if(contract.status!=='active')fail(409,'template_changed','This template version is no longer active. Choose the template again.')
        const schema=await api(`/templates/${body.template_id}/versions/${body.template_version}/schema`)
        const ajv=new Ajv2020({strict:false,allErrors:true});addFormats.default(ajv)
        const validate=ajv.compile(schema)
        if(!validate({fields:body.fields,outputs:body.outputs}))fail(422,'invalid_fields','Check the template fields and output settings before submitting.')
        const errors=validateValues(contract,body.fields as RenderRequest['fields'])
        if(Object.keys(errors).length)fail(422,'invalid_fields',Object.values(errors)[0])
        for(const [field,value]of Object.entries(body.fields))if(record(value)){
          const uploadId=value.upload_id
          if(typeof uploadId!=='string'||Object.keys(value).some(key=>key!=='upload_id'))fail(422,'invalid_media','Upload a file for this field.')
          const owned=await options.store.get(ownerKey(uploadId))
          if(owned?.kind!=='upload'||!owned.ready||owned.templateId!==body.template_id||owned.version!==body.template_version||owned.field!==field)fail(404,'upload_not_found','A file is not available for this template field. Upload it again.')
        }
        const scopedKey=createHash('sha256').update(scope+':'+key).digest('hex')
        const render=await api<Render>('/renders',body,scopedKey)
        await options.store.set(ownerKey(render.id),{kind:'render'},30*86400);return reply(render,201)
      }
      const render=path.match(/^\/renders\/(rnd_[a-f0-9]{24})(\/outputs)?$/i)
      if(render&&!write){const owned=await options.store.get(ownerKey(render[1]));if(owned?.kind!=='render')fail(404,'render_not_found','This render is not available.');return reply(await api(`/renders/${render[1]}${render[2]||''}`))}
      fail(404,'not_found','Endpoint not found.')
    }catch(error){
      if(error instanceof GatewayError)return reply({error:{code:error.code,message:error.message,...(error.requestId?{request_id:error.requestId}:{})}},error.status)
      return reply({error:{code:'order_service_unavailable',message:'The order service is unavailable. Please try again.'}},502)
    }
  }
}
