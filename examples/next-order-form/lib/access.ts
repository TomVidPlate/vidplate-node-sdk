import { createHash, timingSafeEqual } from 'node:crypto'
/** Replace this single-account demo login with your application's session + tenant lookup. */
export function demoIdentity(request: Request): string | null {
  const user=process.env.ORDER_DEMO_USERNAME,password=process.env.ORDER_DEMO_PASSWORD
  if(!user||!password||password.length<16)return null
  const authorization=request.headers.get('authorization')||''
  if(!authorization.startsWith('Basic ')||authorization.length>2048)return null
  const supplied=Buffer.from(authorization.slice(6),'base64').toString('utf8')
  const hash=(value:string)=>createHash('sha256').update(value).digest()
  return timingSafeEqual(hash(supplied),hash(user+':'+password))?user:null
}
