import test from 'node:test'
import assert from 'node:assert/strict'
import { initialValues,validateValues,validateFile,fieldsForRequest,fileContentType } from '../dist/form.js'
import { definition,uploadId } from './fixtures.mjs'
const valid=()=>({...initialValues(definition),HEADLINE:'Hello',PHOTO:{upload_id:uploadId}})
test('placeholders never become answers; false and zero defaults survive',()=>{
 const values=initialValues(definition)
 assert(!('HEADLINE'in values));assert(!('SUBLINE'in values));assert.equal(values.SHOW_CTA,false);assert.equal(values.PRICE,0)
 assert.deepEqual(validateValues(definition,valid()),{})
 const body=fieldsForRequest(definition,{...valid(),SECRET:'not a template field',SUBLINE:''})
 assert(!('SECRET'in body));assert(!('SUBLINE'in body));assert.equal(body.SHOW_CTA,false)
})
test('Unicode code-point limits match the API rather than UTF-16 length',()=>{
 assert.deepEqual(validateValues(definition,{...valid(),HEADLINE:'😀'.repeat(32)}),{})
 assert.match(validateValues(definition,{...valid(),HEADLINE:'😀'.repeat(33)}).HEADLINE,/32/)
})
test('required, enum values, numbers, URLs and colours validate',()=>{
 for(const [key,value]of [['HEADLINE',''],['BADGE','Solid colour'],['PRICE',1000],['LINK','javascript:alert(1)'],['ACCENT','#fff']])assert(validateValues(definition,{...valid(),[key]:value})[key],key)
 assert.deepEqual(validateValues(definition,{...valid(),LINK:'https://example.com',BADGE:'outline'}),{})
 assert(validateValues(definition,{...valid(),PHOTO:undefined}).PHOTO)
})
test('unsupported controls fail explicitly instead of silently submitting',()=>{
 assert(validateValues({...definition,fields:[{name:'NEW',label:'New field',type:'future-feature',constraints:{}}]},{}).NEW)
})
test('file limits, MIME allowlists and GLB extension fallback',()=>{
 const image=definition.fields.find(field=>field.name==='PHOTO')
 assert(validateFile(image,{size:0,type:'image/png'}));assert(validateFile(image,{size:99999999,type:'image/png'}));assert(validateFile(image,{size:30,type:'image/svg+xml'}))
 assert.equal(validateFile(image,{size:30,type:'',name:'photo.PNG'}),null)
 assert.equal(fileContentType({type:'',name:'model.glb'}),'model/gltf-binary')
})
