export const templateId='tpl_0123456789abcdef01234567',uploadId='upl_1123456789abcdef01234567',renderId='rnd_2123456789abcdef01234567'
export const fields=[
 {name:'HEADLINE',type:'text',label:'Headline',required:true,default:null,placeholder:'A new beginning',section:'Content',constraints:{max_length:32}},
 {name:'SUBLINE',type:'textArea',label:'Supporting text',required:false,default:null,placeholder:'Your story goes here',section:'Content',constraints:{max_length:120}},
 {name:'ACCENT',type:'colour',label:'Accent colour',required:false,default:'#1D4ED8',section:'Styling',constraints:{pattern:'^#[0-9A-Fa-f]{6}$'}},
 {name:'BADGE',type:'dropdown',label:'Badge style',required:false,default:'solid',section:'Styling',constraints:{enum:['solid','outline']},option_labels:{solid:'Solid colour',outline:'Outline'}},
 {name:'PRICE',type:'number',label:'Price',required:false,default:0,section:'Content',constraints:{minimum:0,maximum:999}},
 {name:'SHOW_CTA',type:'checkbox',label:'Show call to action',required:false,default:false,section:'Content',constraints:{}},
 {name:'LINK',type:'url',label:'Website link',required:false,default:null,section:'Content',constraints:{}},
 {name:'PHOTO',type:'image',label:'Product photo',required:true,default:null,section:'Media',constraints:{mime_types:['image/png','image/jpeg','image/webp'],max_bytes:5242880,max_pixels:16777216}},
]
export const definition={object:'template_fields',template_id:templateId,kind:'static',version:3,schema_hash:'sha256:fixture',status:'active',fields,formats:{story:{width:1080,height:1920,label:'Story'},square:{width:1080,height:1080,label:'Square'}},durations_seconds:[]}
export const schema={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',required:['fields','outputs'],additionalProperties:false,properties:{fields:{type:'object',required:['HEADLINE','PHOTO'],additionalProperties:false,properties:{HEADLINE:{type:'string',maxLength:32},SUBLINE:{type:'string',maxLength:120},ACCENT:{type:'string',pattern:'^#[0-9A-Fa-f]{6}$'},BADGE:{enum:['solid','outline']},PRICE:{type:'number',minimum:0,maximum:999},SHOW_CTA:{type:'boolean'},LINK:{type:'string',format:'uri'},PHOTO:{$ref:'#/$defs/image_input'}}},outputs:{type:'array',minItems:1,maxItems:2,items:{type:'object',required:['format'],additionalProperties:false,properties:{format:{enum:['story','square']}}}}},$defs:{image_input:{type:'object',required:['upload_id'],additionalProperties:false,properties:{upload_id:{type:'string',pattern:'^upl_'}}}}}
