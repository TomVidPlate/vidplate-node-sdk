'use client'
import { VidPlateOrderBuilder, createHttpTransport } from '@vidplate/react'
// Keep the transport stable across renders; it contains your own backend URL, never an API key.
const transport=createHttpTransport({basePath:'/api/vidplate'})
export default function OrderForm(){return <VidPlateOrderBuilder transport={transport} headingLevel={1}/>}
