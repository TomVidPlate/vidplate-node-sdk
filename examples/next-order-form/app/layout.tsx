import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@vidplate/react/fonts.css'
import '@vidplate/react/styles.css'
import './page.css'
export const metadata:Metadata={title:'Create with VidPlate',description:'Template-powered video and image creation.',robots:{index:false,follow:false}}
export default function Layout({children}:{children:ReactNode}){return <html lang='en'><body>{children}</body></html>}
