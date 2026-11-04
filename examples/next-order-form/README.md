# VidPlate template order form: Next.js example

A working, branded React UI and server-side integration. The browser lists templates, reads the selected version's fields, uploads files, creates a render and downloads its outputs. “Powered by VidPlate” is included.

## Run locally

Node.js 20.9+ is required by Next.js 16. Build the local component package first:

```sh
cd ../../react
npm install
npm run build
cd ../examples/next-order-form
npm install --install-links
```

Copy `.env.example` to `.env.local`. Set `VIDPLATE_API_KEY`, `ORDER_DEMO_USERNAME` and `ORDER_DEMO_PASSWORD` (at least 16 characters). No key or password is supplied. Then run `npm run dev` and open http://localhost:3000. Your browser asks for the example login.

Use a test key while implementing. It needs `templates:read`, `uploads:write`, `renders:read` and `renders:write`. Connect a compatible Browser Node to render. Normal plan limits apply. `ORDER_ALLOWED_TEMPLATE_IDS` can limit this example to a subset of templates the key can access. Existing template content is a placeholder, not automatically submitted text.

## Integration boundary

`app/OrderForm.tsx` talks only to `/api/vidplate`. `lib/gateway.ts` authorizes the caller before contacting VidPlate. The secret API key is server-side; it must never use a `NEXT_PUBLIC_` environment variable. File bytes go straight to the signed upload URL, without passing through a Next.js function's body limit. The server owns the template/version/field context and checks upload ownership before creating a render.

The example is deliberately a **single authenticated account**. Before incorporating it into your platform:

- Replace `demoIdentity` and the Basic-auth proxy with your real session authentication. Resolve the tenant's key and permitted template IDs on the server, never from client input. Use HTTPS when hosting.
- Replace `createMemoryOwnershipStore()` with a shared durable database/Redis store implementing `OwnershipStore`; use the supplied opaque key unchanged. In-memory ownership fails closed after restart and is not suitable for serverless or multiple instances. Store records for the configured TTL. This is not a customer-account database.
- Replace the process-local limiter with your platform's shared per-user limits, spending controls and auditing. VidPlate's own API quotas still apply.
- For orders that must survive browser closure, persist render IDs in your order records and use verified completion webhooks. This example polls for up to 15 minutes, then offers manual refresh. It does not claim background notifications or persistent order history.

The example's origin check blocks cross-origin writes. All gateway responses are `no-store`. Template versions are pinned when the form opens; schema validation and media ownership are checked again on submission. Render submissions reuse their idempotency key after a timeout. Changing the form creates a new request; clicking “Create another” starts a new order.

No API calls are made during `next build`. Build with `npm run build` and start with `npm start`. The source kit is prepared locally; `@vidplate/react` has not yet been published to npm.
