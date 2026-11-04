import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrderGateway,createMemoryOwnershipStore } from '../dist/server.js'
import { definition,schema,templateId,uploadId,renderId } from './fixtures.mjs'
const origin='https://customer.example',key='vpk_test_fixture_not_a_real_key'
function setup(overrides={}){
 const calls=[]
 const handler=createOrderGateway({store:createMemoryOwnershipStore(),authorize:async request=>request.headers.get('x-user')?{principal:request.headers.get('x-user'),apiKey:key}:null,fetch:async(url,init)=>{
  assert.equal(init.headers.Authorization,'Bearer '+key);calls.push({url,init})
  const path=new URL(url).pathname.replace('/v1','')
  if(path==='/templates')return Response.json({data:[{id:templateId}],has_more:false,next_cursor:null})
  if(path.includes('/fields'))return Response.json(definition)
  if(path.endsWith('/schema'))return Response.json(schema)
  if(path.includes('/versions/'))return Response.json(definition)
  if(path==='/uploads')return Response.json({id:uploadId,upload:{url:'https://uploads.example/put',headers:{'Content-Type':'image/png'}}})
  if(path.endsWith('/complete'))return Response.json({id:uploadId,status:'ready'})
  if(path==='/renders')return Response.json({id:renderId,status:'queued'})
  if(path.endsWith('/outputs'))return Response.json({data:[]})
  if(path.includes('/renders/'))return Response.json({id:renderId,status:'completed'})
  throw Error(path)
 },...overrides})
 const request=(path,body,user='alice',headers={})=>handler(new Request(origin+'/api/vidplate'+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'x-user':user}:{}),...(body===undefined?{}:{origin,'Content-Type':'application/json','Idempotency-Key':'order-fixture-1234567890'}),...headers},body:body===undefined?undefined:JSON.stringify(body)}))
 return {calls,request}
}
const uploadBody={template_id:templateId,template_version:3,field:'PHOTO',filename:'photo.png',content_type:'image/png',size_bytes:50}
const renderBody={template_id:templateId,template_version:3,fields:{HEADLINE:'Hello',PHOTO:{upload_id:uploadId},SHOW_CTA:false,PRICE:0},outputs:[{format:'story'}]}
test('unauthenticated and cross-origin writes fail before touching VidPlate',async()=>{
 const{calls,request}=setup();assert.equal((await request('/templates',undefined,null)).status,401)
 assert.equal((await request('/renders',renderBody,'alice',{origin:'https://evil.example'})).status,403);assert.equal(calls.length,0)
})
test('pinned definitions combine field metadata and version output sizes',async()=>{
 const{request}=setup();const result=await(await request('/templates/'+templateId)).json()
 assert.equal(result.version,3);assert.equal(result.fields[0].default,null);assert.equal(result.formats.story.width,1080);assert(!JSON.stringify(result).includes(key))
})
test('upload, complete, validate, render, poll and outputs work with the real contract shape',async()=>{
 const{calls,request}=setup();assert.equal((await request('/uploads',uploadBody)).status,201)
 assert.equal((await request('/uploads/'+uploadId+'/complete',{})).status,200)
 assert.equal((await request('/renders',renderBody)).status,201)
 assert.equal((await request('/renders',renderBody)).status,201)
 const creates=calls.filter(call=>new URL(call.url).pathname==='/v1/renders')
 assert.equal(creates[0].init.headers['Idempotency-Key'],creates[1].init.headers['Idempotency-Key'])
 assert.equal(JSON.parse(creates[0].init.body).template_version,3)
 assert.equal(JSON.parse(creates[0].init.body).fields.SHOW_CTA,false)
 assert.equal((await request('/renders/'+renderId)).status,200);assert.equal((await request('/renders/'+renderId+'/outputs')).status,200)
 assert.equal((await request('/renders/'+renderId,undefined,'bob')).status,404)
})
test('uploads cannot be stolen across users sharing the same workspace key',async()=>{
 const{calls,request}=setup();await request('/uploads',uploadBody)
 assert.equal((await request('/uploads/'+uploadId+'/complete',{},'bob')).status,404)
 await request('/uploads/'+uploadId+'/complete',{})
 assert.equal((await request('/renders',renderBody,'bob')).status,404)
 assert.equal(calls.filter(call=>new URL(call.url).pathname==='/v1/renders').length,0)
})
test('unverified uploads and unknown render IDs are inaccessible',async()=>{
 const{request}=setup();await request('/uploads',uploadBody)
 assert.equal((await request('/renders',renderBody)).status,404)
 assert.equal((await request('/renders/'+renderId)).status,404)
})
test('schema, upload bounds and format validation run before a paid render',async()=>{
 const{calls,request}=setup()
 assert.equal((await request('/uploads',{...uploadBody,size_bytes:999999999})).status,422)
 assert.equal((await request('/renders',{...renderBody,fields:{...renderBody.fields,HEADLINE:'x'.repeat(33)}})).status,422)
 assert.equal((await request('/renders',{...renderBody,outputs:[{format:'imaginary'}]})).status,422)
 assert.equal((await request('/renders',{...renderBody,api_key:'evil'})).status,400)
 assert.equal((await request('/renders',renderBody,'alice',{'Idempotency-Key':''})).status,400)
 assert.equal(calls.filter(call=>new URL(call.url).pathname==='/v1/renders').length,0)
})
test('tenant template allowlists and rate limits are enforced server-side',async()=>{
 const restricted=setup({authorize:async()=>({principal:'alice',apiKey:key,templateIds:[]})})
 assert.equal((await(await restricted.request('/templates')).json()).data.length,0)
 assert.equal((await restricted.request('/templates/'+templateId)).status,404)
 const limited=setup({rateLimit:async()=>false});assert.equal((await limited.request('/templates')).status,429);assert.equal(limited.calls.length,0)
})
test('gateway has no arbitrary proxy route and refuses excessive form bodies',async()=>{
 const{request}=setup();assert.equal((await request('/me')).status,404)
 assert.equal((await request('/renders',{...renderBody,padding:'x'.repeat(66000)})).status,413)
})
test('memory ownership store expires and fails closed at capacity',async()=>{
 const store=createMemoryOwnershipStore({maxEntries:1});await store.set('a',{kind:'render'},60)
 await assert.rejects(store.set('b',{kind:'render'},60));assert.equal(await store.get('b'),null)
 await store.set('a',{kind:'render'},-1);assert.equal(await store.get('a'),null)
})
