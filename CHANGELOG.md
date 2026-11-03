# Changelog

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
