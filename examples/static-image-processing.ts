import { VidPlateClient } from '../src/index.ts'

const api = new VidPlateClient({ apiKey: process.env.VIDPLATE_API_KEY! })
// Upload and complete the photo first using the uploads endpoints.
const job = await api.createMediaJob({
    operation: 'image_edit',
    inputs: [{ upload_id: process.env.PHOTO_UPLOAD_ID! }],
    image: { auto_enhance: true, adjustments: { exposure: 0.3, saturation: 10 } },
    outputs: [{ width: 3840, height: 2160, image_format: 'webp', image_quality: 85 }],
})
console.log(job.id)
