import 'server-only'
import { createMemoryOwnershipStore, createOrderGateway } from '@vidplate/react/server'
import { demoIdentity } from './access'
const state=globalThis as typeof globalThis&{vidplateOrderStore?:ReturnType<typeof createMemoryOwnershipStore>;vidplateOrderRates?:Map<string,{count:number;until:number}>}
const store=state.vidplateOrderStore??=createMemoryOwnershipStore()
const rates=state.vidplateOrderRates??=new Map()
export const handleOrderRequest=createOrderGateway({
  store,
  apiBaseUrl:process.env.VIDPLATE_API_BASE_URL,
  allowedOrigin:process.env.ORDER_PUBLIC_ORIGIN||undefined,
  async authorize(request){
    const principal=demoIdentity(request),apiKey=process.env.VIDPLATE_API_KEY
    if(!principal||!apiKey)return null
    const templateIds=process.env.ORDER_ALLOWED_TEMPLATE_IDS?.split(',').map(value=>value.trim()).filter(Boolean)
    return {principal,apiKey,...(templateIds?.length?{templateIds}:{})}
  },
  async rateLimit(access,write){
    for(const[key,value]of rates)if(value.until<Date.now())rates.delete(key)
    const key=access.principal+':'+(write?'write':'read'),limit=write?20:120
    const current=rates.get(key)||{count:0,until:Date.now()+60000};current.count++;rates.set(key,current)
    return current.count<=limit
  },
})
