import { VidPlateClient } from '../src/index.ts'

const api = new VidPlateClient({ apiKey: process.env.VIDPLATE_API_KEY! })
// Refresh Browser Node tabs first. ProRes uses original template frames, not MP4 conversion.
// 512 MiB maximum per output. No preset, quality, bitrate or max-file-size controls.
const render = await api.createRender({
    template_id: process.env.TEMPLATE_ID!,
    fields: {},
    outputs: [{ format: '16x9', duration_seconds: 5, resolution: '2160p', fps: 30, codec: 'prores_422_hq' }],
})
console.log(render.id)
