# Overnight Atlas

Overnight Atlas is a small, deployable Node.js web app for finding free, no-membership RV-friendly retail and travel locations in the United States.

## What changed from the original app

The old version shipped a large static dataset with unreliable-looking addresses, no contact information, no source links, and no way to distinguish a real record from a placeholder. This version removes that dataset completely.

Instead, the server queries live OpenStreetMap data through Overpass. A result is only returned when its map record explicitly says `caravan=yes` or `motorhome=yes` and does not say `fee=yes`. Search accepts a city, state, or ZIP code; the map also loads a smaller area as it is moved and zoomed.

This is intentionally not marketed as a guarantee that every property allows overnight parking. Policies are local, change without notice, and may depend on a manager's permission. Always read the signs and ask before staying. The source record is linked on every result.

## Run locally

Requires Node.js 18 or newer.

```bash
npm start
```

Open http://localhost:3000.

For development with automatic server restart:

```bash
npm run dev
```

## Deploy

Deploy as a Node.js service with the start command `npm start`. The app has no build step and no API keys. The server serves the app shell at `/` and the ZIP includes a normal `index.html` for editing. For a production multi-user deployment, replace the local `data/reports.ndjson` report sink with durable storage and add rate limiting/authentication.

## Data and attribution

- Map tiles: OpenStreetMap contributors
- Search/geocoding: Nominatim
- Map data: Overpass API
- The query and inclusion rules are documented in `server.js` and `data/README.md`.

All three services have usage policies and rate limits. A production deployment should use an approved caching/proxy strategy and a descriptive User-Agent.