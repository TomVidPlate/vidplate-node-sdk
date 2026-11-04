# Changelog

## 0.3.0 - 4 November 2026

- Updated generated types and methods for 62 API operations, including caption presets and pipelines.
- Added animated caption, transcription/SRT and advanced caption customisation types.
- Added typed pipeline helpers for estimates, submission, status, outputs, cancellation and retries.
- Preserved idempotency keys across automatic retries.

## 0.2.2 - 2026-11-03

- Added ProRes 4444 MOV with transparency to template output types.
- Added ProRes 422, 422 HQ and 4444 to video media-job conversion types.
- Added a file-conversion example. ProRes exports use 10-bit SDR files; source decoding and effects can limit retained precision. Refresh Browser Node tabs before use.
- ProRes outputs have a 512 MiB cap. ProRes inputs and local-media ProRes jobs remain unsupported.

## 0.2.1 - 2026-11-03

- Typed ProRes 422 and 422 HQ template masters, MOV outputs and node capabilities.
- Added a 4K ProRes request example. The initial export uses original 8-bit SDR canvas frames, PCM audio and a 512 MiB output limit.
- ProRes is restricted to original template renders; media editing and local-media operations are unchanged.

## 0.2.0 - 2026-11-03

- Typed static image editing and collage requests: crop/resize, rotation/flips, photo adjustments and non-AI auto enhance.
- LUT colour grading with intensity, PNG/text branding, and PNG/JPEG/WebP output controls.
- Video frame extraction/contact sheets, transforms, overlays and background music controls.
- Updated image-output response types and examples. Existing methods remain compatible.

## 0.1.0 - 2026-11-03

Initial public Node.js and TypeScript SDK.

- Typed client methods generated from API schema 2026.11.02.
- Template rendering, media jobs and output retrieval.
- Automatic idempotency keys and bounded retries.
- Pagination and render/media-job polling.
- Webhook signature verification and typed API errors.

Published to npm as @vidplate/api@0.1.0 on 3 November 2026.
