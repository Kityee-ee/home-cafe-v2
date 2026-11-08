# Home Café v2

An ordering page for Kit's BYOP brunch. Guests add drinks, check out with their name, and can change or cancel their order until the day. It runs separately from v1 (`../home-cafe`): this project has its own link and its own data.

## Run locally

```sh
npm run dev            # http://localhost:3000, or PORT=3107 npm run dev
```

- Guests: `/`
- Host board: `/host?key=devhost`

Without Redis settings, orders are saved to `.data/dev-store.json`.

## Change things

- **Drinks:** `public/menu.js` (names, hot/iced, descriptions)
- **Date, time, address:** `lib/event.js`
- **Videos:** `public/media/<name>.mp4`, with a `.jpg` still of its last frame

## Deploy (Vercel)

1. Create a **new** Vercel project from this folder. Don't reuse v1's project.
2. Add an Upstash Redis database from the Vercel Marketplace. That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Keys are prefixed `cafe2:`, so even a database shared with v1 keeps the two sets of orders apart.
3. Set `HOST_KEY` to a private word. The host board is at `/host?key=<HOST_KEY>`.
4. Optional: `MAX_GUESTS` (default 80).
5. After the first deploy, change `og:image` in `public/index.html` to the full URL (`https://<your-domain>/og.jpg`) so WhatsApp and Instagram link previews show the drinks.
