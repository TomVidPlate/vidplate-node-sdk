import { VidPlateClient } from '../dist/index.js'

if (!process.env.VIDPLATE_API_KEY) throw new Error('Set VIDPLATE_API_KEY')
const client = new VidPlateClient({ apiKey: process.env.VIDPLATE_API_KEY })
const page = await client.listTemplates({ limit: 10 })
for (const template of page.data ?? []) console.log(template.id, template.name)
