'use client'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { fieldsForRequest, initialValues, isMediaField, validateFile, validateValues } from './form.js'
import type { FieldValue, ListResult, OrderTransport, Render, RenderOutput, Template, TemplateDefinition, TemplateField } from './types.js'

function Icon({ name }: { name: 'grid' | 'search' | 'arrow' | 'upload' | 'film' | 'image' | 'check' | 'download' | 'refresh' }) {
  const paths = { grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', arrow: 'M4 12h16m-6-6 6 6-6 6', upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5', film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4m-4 6h4m10-6h4m-4 6h4', image: 'M3 3h18v18H3zM3 16l6-6 12 11M15 7h.01', check: 'm5 12 4 4L19 6', download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4', refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5' }
  return <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d={paths[name]} /></svg>
}
export function PoweredByVidPlate() { return <a className='vp-order-powered' href='https://vidplate.app/developers' target='_blank' rel='noopener noreferrer'><svg viewBox='0 0 92 83' aria-hidden='true'><path fill='currentColor' d='M53.466 77.374c-3.56 6.119-12.458 6.119-16.017 0L1.402 15.41C-1.76 9.974.725 3.459 5.87 1.003c1.978-.945 12.6-1.027 12.394 1.141-1.21 12.736.437 20.389 8.46 20.856 7.479.436 15.702-5.772 18.143-14.995A10.86 10.86 0 0 1 55.36 0h27.099c7.119 0 11.568 7.649 8.009 13.767Z' /></svg><span>Powered by <strong>VidPlate</strong></span></a> }
function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <p className={`vp-order-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> }
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'

export type TemplatePickerProps = { templates: Template[]; selectedId?: string; loading?: boolean; hasMore?: boolean; onLoadMore?: () => void; onSelect: (template: Template) => void }
export function TemplatePicker({ templates, selectedId, loading, hasMore, onLoadMore, onSelect }: TemplatePickerProps) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all')
  const filtered = templates.filter(template => (kind === 'all' || template.kind === kind) && `${template.name} ${template.description || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <section className='vp-order-picker' aria-label='Choose a template'>
    <div className='vp-order-section-title'><span className='vp-order-icon'><Icon name='grid' /></span><div><small>STEP 01</small><h2>Choose your template</h2></div></div>
    <label className='vp-order-search'><Icon name='search' /><span className='vp-order-sr'>Search templates</span><input type='search' placeholder='Find a template…' value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className='vp-order-tabs' role='group' aria-label='Template type'>{[['all','All templates'],['video','Video'],['static','Images']].map(([value,label]) => <button key={value} type='button' aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div>
    <div className='vp-order-template-list' aria-busy={loading}>{filtered.map(template => <button type='button' key={template.id} className={`vp-order-template${selectedId === template.id ? ' is-selected' : ''}`} aria-pressed={selectedId === template.id} disabled={template.availability !== 'available'} onClick={() => onSelect(template)}>
      <span className={`vp-order-template-art is-${template.kind}`}><Icon name={template.kind === 'video' ? 'film' : 'image'} /><span>{template.kind === 'video' ? 'MOTION' : 'CANVAS'}</span></span><span className='vp-order-template-copy'><span className='vp-order-template-name'>{template.name}</span><span>{template.description || `${template.kind === 'video' ? 'Video' : 'Image'} template`}</span><small>{template.availability !== 'available' ? 'Not available yet' : `${Object.keys(template.formats || {}).length} output sizes`}</small></span><span className='vp-order-template-select'><Icon name={selectedId === template.id ? 'check' : 'arrow'} /></span>
    </button>)}</div>
    {!filtered.length && <Notice>{loading ? 'Loading templates…' : templates.length ? 'No matching templates.' : 'No published templates are available yet.'}</Notice>}
    {hasMore && <button className='vp-order-secondary vp-order-wide' type='button' disabled={loading} onClick={onLoadMore}>{loading ? 'Loading…' : query ? 'Search more templates' : 'Load more templates'}</button>}
  </section>
}

export type TemplateOrderFormProps = { definition: TemplateDefinition; transport: OrderTransport; onRender: (render: Render) => void; templateName?: string }
export function TemplateOrderForm(props: TemplateOrderFormProps) { return <OrderForm key={`${props.definition.template_id}:${props.definition.version}:${props.definition.schema_hash}`} {...props} /> }
function OrderForm({ definition, transport, onRender, templateName }: TemplateOrderFormProps) {
  const prefix = useId(), form = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState(() => initialValues(definition)), [errors, setErrors] = useState<Record<string,string>>({})
  const [formats, setFormats] = useState<string[]>(Object.keys(definition.formats).slice(0,1)), [duration, setDuration] = useState<number | undefined>(definition.durations_seconds[0])
  const [uploads, setUploads] = useState<Record<string,{ name:string; progress:number; busy:boolean }>>({}), [submitting, setSubmitting] = useState(false), [failure, setFailure] = useState('')
  const controllers = useRef(new Map<string, AbortController>()), activeSubmit = useRef(false), renderController = useRef<AbortController>(), idempotency = useRef<{ body:string; key:string }>()
  useEffect(() => () => { controllers.current.forEach(controller => controller.abort()); renderController.current?.abort() }, [])
  const setValue = (field: TemplateField, value?: FieldValue) => { setValues(previous => { const next={...previous}; if(value === undefined) delete next[field.name]; else next[field.name]=value; return next }); setErrors(previous => { const next={...previous}; delete next[field.name]; return next }) }
  async function upload(field: TemplateField, file?: File) {
    if (!file) return
    controllers.current.get(field.name)?.abort()
    const error = validateFile(field, file)
    if (error) { setErrors(previous => ({...previous,[field.name]:error})); setUploads(previous=>({...previous,...(previous[field.name]?{[field.name]:{...previous[field.name],busy:false}}:{})})); return }
    const controller = new AbortController(); controllers.current.set(field.name,controller); setValue(field)
    setUploads(previous => ({...previous,[field.name]:{name:file.name,progress:0,busy:true}}))
    try {
      const result = await transport.upload(file,{template_id:definition.template_id,template_version:definition.version,field:field.name}, progress => { if (!controller.signal.aborted) setUploads(previous => ({...previous,[field.name]:{name:file.name,progress,busy:true}})) },controller.signal)
      if (!controller.signal.aborted) { setValue(field,result); setUploads(previous => ({...previous,[field.name]:{name:file.name,progress:100,busy:false}})) }
    } catch(error) { if (!controller.signal.aborted) { setErrors(previous=>({...previous,[field.name]:message(error)})); setUploads(previous=>({...previous,[field.name]:{name:file.name,progress:0,busy:false}})) } }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if(activeSubmit.current || Object.values(uploads).some(upload=>upload.busy))return
    const validation = validateValues(definition,values)
    if (!formats.length) validation.outputs='Choose at least one output size.'
    if (definition.status !== 'active') validation.template='This template version is no longer active. Choose the template again.'
    setErrors(validation);setFailure('')
    if(Object.keys(validation).length){setTimeout(()=>form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),0);return}
    const request={template_id:definition.template_id,template_version:definition.version,fields:fieldsForRequest(definition,values),outputs:formats.map(format=>({format,...(duration!==undefined?{duration_seconds:duration}:{})}))}
    const body=JSON.stringify(request)
    if(idempotency.current?.body!==body)idempotency.current={body,key:crypto.randomUUID()}
    activeSubmit.current=true;setSubmitting(true);renderController.current=new AbortController()
    try{const render=await transport.createRender(request,idempotency.current!.key,renderController.current.signal);if(!renderController.current.signal.aborted)onRender(render)}
    catch(error){if(!renderController.current.signal.aborted)setFailure(message(error))}
    finally{activeSubmit.current=false;if(!renderController.current.signal.aborted)setSubmitting(false)}
  }
  const groups = [...new Set(definition.fields.map(field=>field.section || 'Content'))]
  const busy = submitting || Object.values(uploads).some(upload=>upload.busy)
  return <form ref={form} className='vp-order-form' onSubmit={submit} noValidate>
    <div className='vp-order-section-title'><span className='vp-order-icon'><Icon name='image' /></span><div><small>STEP 02 · VERSION {definition.version}</small><h2>Make it yours</h2></div></div>
    {templateName && <p className='vp-order-selected-name'>{templateName}</p>}
    <fieldset disabled={submitting}>{groups.map(group=><section className='vp-order-fields' key={group}><h3>{group.replace(/[-_]/g,' ')}</h3>{definition.fields.filter(field=>(field.section||'Content')===group).map(field=>{
      const id=`${prefix}-${field.name}`,hint=`${id}-hint`,error=`${id}-error`,value=values[field.name],invalid=!!errors[field.name]
      const common={id,'aria-invalid':invalid||undefined,'aria-describedby':`${hint}${invalid?` ${error}`:''}`}
      return <div className='vp-order-field' key={field.name}>
        {field.type!=='checkbox'&&<label htmlFor={id}>{field.label}{field.required?<span className='vp-order-required'> *</span>:<small>Optional</small>}</label>}
        {isMediaField(field)?<div className='vp-order-file'><label className='vp-order-upload' htmlFor={id}><Icon name='upload'/><span>{uploads[field.name]?.busy?`Uploading ${uploads[field.name].progress}%`:typeof value==='object'?'Replace file':'Choose a file'}</span></label><input {...common} type='file' accept={field.constraints.mime_types?.join(',')} onChange={event=>{void upload(field,event.target.files?.[0]);event.target.value=''}} /><span className='vp-order-file-name'>{uploads[field.name]?.name || (field.constraints.mime_types || []).map(type=>type.split('/')[1]).join(' · ') || 'Image, video, audio or 3D file'}</span>{typeof value==='object'&&<button type='button' className='vp-order-inline' aria-label={`Remove ${field.label}`} onClick={()=>{controllers.current.get(field.name)?.abort();setValue(field);setUploads(previous=>{const next={...previous};delete next[field.name];return next})}}>Remove</button>}</div>
        :field.type==='dropdown'?<select {...common} value={String(value??'')} onChange={event=>setValue(field,event.target.value)}><option value=''>Choose an option</option>{field.constraints.enum?.map(option=><option key={option} value={option}>{field.option_labels?.[option]||option}</option>)}</select>
        :field.type==='checkbox'?<label className='vp-order-check'><input {...common} type='checkbox' checked={value===true} onChange={event=>setValue(field,event.target.checked)} /><span>{field.label}</span>{field.required?<span className='vp-order-required'> *</span>:<small>Optional</small>}</label>
        :['textArea','textarea'].includes(field.type)?<textarea {...common} rows={3} value={String(value??'')} placeholder={field.placeholder||undefined} onChange={event=>setValue(field,event.target.value)} />
        :['colour','color'].includes(field.type)?<div className='vp-order-colour'><input type='color' aria-label={`${field.label} colour picker`} value={typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:'#1D4ED8'} onChange={event=>setValue(field,event.target.value)} /><input {...common} type='text' placeholder='#1D4ED8' value={String(value??'')} onChange={event=>setValue(field,event.target.value)} /></div>
        :<input {...common} type={field.type==='number'?'number':field.type==='url'?'url':'text'} value={String(value??'')} placeholder={field.placeholder||undefined} min={field.constraints.minimum} max={field.constraints.maximum} step={field.constraints.step||'any'} onChange={event=>setValue(field,event.target.value===''?undefined:field.type==='number'?Number(event.target.value):event.target.value)} />}
        <div className='vp-order-field-hint' id={hint}>{field.description&&<span>{field.description}</span>}{field.constraints.max_length!==undefined&&<span>{Array.from(typeof value==='string'?value:'').length}/{field.constraints.max_length}</span>}</div>
        {invalid&&<p id={error} className='vp-order-field-error'>{errors[field.name]}</p>}
      </div>
    })}</section>)}
    <section className='vp-order-fields'><h3>Output sizes</h3><div className='vp-order-formats'>{Object.entries(definition.formats).map(([key,format])=><label key={key}><input type='checkbox' aria-invalid={!!errors.outputs||undefined} checked={formats.includes(key)} onChange={event=>setFormats(previous=>event.target.checked?[...previous,key]:previous.filter(value=>value!==key))} disabled={!formats.includes(key)&&formats.length>=8}/><span><strong>{format.label||key}</strong><small>{format.width} × {format.height}</small></span></label>)}</div>{errors.outputs&&<p className='vp-order-field-error'>{errors.outputs}</p>}{definition.durations_seconds.length>0&&<label className='vp-order-duration'>Duration<select value={duration} onChange={event=>setDuration(Number(event.target.value))}>{definition.durations_seconds.map(seconds=><option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>}</section>
    </fieldset>
    {errors.template&&<Notice error>{errors.template}</Notice>}{failure&&<Notice error>{failure}</Notice>}
    <div className='vp-order-submit'><button className='vp-order-primary' type='submit' disabled={busy||!Object.keys(definition.formats).length}>{submitting?'Submitting…':Object.values(uploads).some(upload=>upload.busy)?'Uploading…':'Create your content'}<Icon name='arrow'/></button><span>{formats.length} selected {formats.length===1?'output':'outputs'}</span></div>
    <PoweredByVidPlate />
  </form>
}

const terminal = new Set(['completed','failed','cancelled','expired'])
export function RenderStatus({ render, transport, onNewOrder }: { render: Render; transport: OrderTransport; onNewOrder?: () => void }) {
  const [current,setCurrent]=useState(render),[outputs,setOutputs]=useState<RenderOutput[]>([]),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;const started=Date.now()
    async function check(){
      try{
        const next=await transport.getRender(render.id,controller.signal);if(controller.signal.aborted)return;setCurrent(next);setError('')
        if(terminal.has(next.status)){const result=await transport.getOutputs(render.id,controller.signal);if(!controller.signal.aborted)setOutputs(result.data)}
        else if(Date.now()-started<15*60*1000)timer=setTimeout(check,2500)
        else setError('Your render is still pending. Refresh its status to keep checking.')
      }catch(error){if(!controller.signal.aborted)setError(message(error))}
    }
    void check();return()=>{controller.abort();clearTimeout(timer)}
  },[render.id,transport,attempt])
  const done=current.status==='completed',failed=['failed','cancelled','expired'].includes(current.status)
  const percent=Math.min(100,Math.max(0,Number(current.progress?.percent)||0))
  return <section className='vp-order-status' aria-label='Render status'><span className='vp-order-status-art'><Icon name={done?'check':failed?'refresh':'film'} /></span><small>{done?'READY TO DOWNLOAD':failed?'RENDER UPDATE':'STEP 03'}</small><h2>{done?'Your content is ready.':failed?'This render did not finish.':current.status==='waiting_for_node'?'Waiting for a Browser Node.':'Bringing it together.'}</h2><p>{current.status==='waiting_for_node'?'Connect a compatible Browser Node to start rendering.':done?'Download your files below.':failed?'Check the status or create a new order.':'You can follow the progress here.'}</p><code className='vp-order-render-id'>{render.id}</code>
    {!terminal.has(current.status)&&<progress aria-label='Render progress' max={100} value={percent}/>}
    <div className='vp-order-outputs'>{outputs.map(output=><div key={output.id}><span>{output.file_name||output.format||'Output'}<small>{output.status.replace(/_/g,' ')}</small></span>{output.download_url&&/^https?:\/\//i.test(output.download_url)?<a className='vp-order-secondary' href={output.download_url} target='_blank' rel='noopener noreferrer'><Icon name='download'/>Download</a>:<small>{output.status==='completed'?'No managed download available.':output.failure_code||'File unavailable'}</small>}</div>)}</div>
    {error&&<Notice error>{error}</Notice>}<div className='vp-order-status-actions'><button type='button' className='vp-order-secondary' onClick={()=>setAttempt(value=>value+1)}><Icon name='refresh'/>Refresh {done?'links':'status'}</button>{terminal.has(current.status)&&onNewOrder&&<button className='vp-order-primary' type='button' onClick={onNewOrder}>Create another<Icon name='arrow'/></button>}</div><PoweredByVidPlate/>
  </section>
}

export type VidPlateOrderBuilderProps = { transport: OrderTransport; title?: string; description?: string; className?: string; headingLevel?: 1 | 2; onRender?: (render: Render) => void }
export function VidPlateOrderBuilder({ transport, title='A template. Your story.', description='Choose a design, add your content and make it yours.', className='', headingLevel=2, onRender }: VidPlateOrderBuilderProps) {
  const [list,setList]=useState<ListResult>({data:[],has_more:false,next_cursor:null}),[loading,setLoading]=useState(true),[listError,setListError]=useState(''),[retry,setRetry]=useState(0)
  const [template,setTemplate]=useState<Template>(),[definition,setDefinition]=useState<TemplateDefinition>(),[definitionError,setDefinitionError]=useState(''),[definitionLoading,setDefinitionLoading]=useState(false),[render,setRender]=useState<Render>(),[order,setOrder]=useState(0)
  const more=useRef<AbortController>(),mounted=useRef(true)
  useEffect(()=>{mounted.current=true;const controller=new AbortController();setLoading(true);setList({data:[],has_more:false,next_cursor:null});setListError('');setTemplate(undefined);setDefinition(undefined);setRender(undefined)
    transport.listTemplates({signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setList(result)}).catch(error=>{if(!controller.signal.aborted)setListError(message(error))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>{mounted.current=false;controller.abort();more.current?.abort()}
  },[transport,retry])
  useEffect(()=>{if(!template)return;const controller=new AbortController();setDefinition(undefined);setDefinitionLoading(true);setDefinitionError('')
    transport.getDefinition(template.id,controller.signal).then(result=>{if(!controller.signal.aborted)setDefinition(result)}).catch(error=>{if(!controller.signal.aborted)setDefinitionError(message(error))}).finally(()=>{if(!controller.signal.aborted)setDefinitionLoading(false)})
    return()=>controller.abort()
  },[template,transport])
  async function loadMore(){if(loading||!list.next_cursor||more.current&&!more.current.signal.aborted)return;const controller=new AbortController();more.current=controller;setLoading(true);setListError('')
    try{const result=await transport.listTemplates({cursor:list.next_cursor,signal:controller.signal});if(!controller.signal.aborted)setList(previous=>({...result,data:[...new Map([...previous.data,...result.data].map(template=>[template.id,template])).values()]}))}
    catch(error){if(mounted.current&&!controller.signal.aborted)setListError(message(error))}finally{if(mounted.current&&!controller.signal.aborted)setLoading(false);if(more.current===controller)more.current=undefined}
  }
  const Heading=headingLevel===1?'h1':'h2'
  return <div className={`vp-order ${className}`}><header className='vp-order-header'><small>CREATE WITH VIDPLATE</small><Heading>{title}</Heading><p>{description}</p></header>{render?<RenderStatus key={render.id} render={render} transport={transport} onNewOrder={()=>{setRender(undefined);setOrder(value=>value+1)}}/>:<div className='vp-order-layout'><div><TemplatePicker templates={list.data} selectedId={template?.id} loading={loading} hasMore={list.has_more} onLoadMore={()=>void loadMore()} onSelect={setTemplate}/>{listError&&<><Notice error>{listError}</Notice><button className='vp-order-secondary' type='button' onClick={()=>setRetry(value=>value+1)}>Try again</button></>}</div><div className='vp-order-detail' aria-busy={definitionLoading}>{definitionLoading?<Notice>Loading your template…</Notice>:definition?<TemplateOrderForm key={order} templateName={template?.name} definition={definition} transport={transport} onRender={result=>{setRender(result);onRender?.(result)}}/>:definitionError?<><Notice error>{definitionError}</Notice><button type='button' className='vp-order-secondary' onClick={()=>setTemplate(previous=>previous?{...previous}:previous)}>Try again</button></>:<div className='vp-order-welcome'><span className='vp-order-welcome-art'><Icon name='image'/><Icon name='film'/></span><h2>Your next creation<br/>starts here.</h2><p>Pick a template to see its content options.</p><PoweredByVidPlate/></div>}</div></div>}</div>
}
