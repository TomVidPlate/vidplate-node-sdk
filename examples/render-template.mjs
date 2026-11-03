import { VidPlateClient } from '../dist/index.js'

const { VIDPLATE_API_KEY, VIDPLATE_TEMPLATE_ID, VIDPLATE_FORMAT } = process.env
if (!VIDPLATE_API_KEY || !VIDPLATE_TEMPLATE_ID || !VIDPLATE_FORMAT) throw new Error('Set VIDPLATE_API_KEY, VIDPLATE_TEMPLATE_ID and VIDPLATE_FORMAT')
const client = new VidPlateClient({ apiKey: VIDPLATE_API_KEY })
// Use a template with no required fields, or supply its required fields below.
const created = await client.createRender({ template_id: VIDPLATE_TEMPLATE_ID, fields: {}, outputs: [{ format: VIDPLATE_FORMAT }] })
const render = await client.waitForRender(created.id)
console.log(render.id, render.status)
// Obtain download links only when needed; never log signed URLs in shared logs.
