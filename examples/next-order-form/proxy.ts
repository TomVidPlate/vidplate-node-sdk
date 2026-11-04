import { NextResponse, type NextRequest } from 'next/server'
import { demoIdentity } from './lib/access'
export function proxy(request:NextRequest){
  if(!process.env.ORDER_DEMO_USERNAME||!process.env.ORDER_DEMO_PASSWORD||process.env.ORDER_DEMO_PASSWORD.length<16)return new NextResponse('Set the example login username and a password of at least 16 characters.',{status:503,headers:{'Cache-Control':'no-store'}})
  if(!demoIdentity(request))return new NextResponse('Sign in to the VidPlate order form example.',{status:401,headers:{'WWW-Authenticate':'Basic realm="VidPlate order form", charset="UTF-8"','Cache-Control':'no-store'}})
  return NextResponse.next()
}
export const config={matcher:['/','/api/vidplate/:path*']}
