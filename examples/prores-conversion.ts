import { VidPlateClient } from '../src/index.ts'

const api = new VidPlateClient({ apiKey: process.env.VIDPLATE_API_KEY! })
// Upload a browser-decodable source first. ProRes is an output codec, not an input decoder.
// 4444 preserves supported source alpha; it does not remove a background.
const job = await api.createMediaJob({
    operation: 'convert',
    inputs: [{ upload_id: process.env.UPLOAD_ID! }],
    outputs: [{ codec: 'prores_422_hq', fps: 30 }],
})
console.log(job.id)
