# deposit-progress-api

A standalone Next.js (App Router) app that exposes a **period-based deposit
progress** API plus a premium black-gold **Bonus Mission Progress** page, and an
embeddable **Weekly VIP Bonus** widget for your own website.

## Setup

```bash
cd deposit-progress-api
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

- Test page: http://localhost:3000
- API: http://localhost:3000/api/deposit-progress?userId=19319AA28&period=week

## Environment variables

| Variable                     | Required | Purpose                                                                 |
| ---------------------------- | -------- | ----------------------------------------------------------------------- |
| `BACKEND_ACCESS_ID`          | yes      | Backend credential (server-side only)                                   |
| `BACKEND_ACCESS_TOKEN`       | yes      | Backend credential (server-side only)                                   |
| `BACKEND_TK`                 | yes      | Backend `tk` cookie value (server-side only)                            |
| `PUBLIC_API_SECRET`          | prod     | If set, callers must send a matching `x-api-secret` header (else 401)   |
| `ALLOWED_ORIGIN`             | no       | CORS allow-origin. `*` (default) or your site origin                    |
| `USER_LOOKUP_MODULE`         | no       | Username→id lookup module (default `/users/getAllUsers`)                |
| `USER_LOOKUP_USERNAME_FIELD` | no       | Lookup field name (default `id`)                                        |

> Backend credentials are read **only** inside the API route and are never sent
> to the browser.

## API

`GET /api/deposit-progress?userId=<id|username>&period=<today|week|month>`

- `userId` accepts a numeric id or a username (e.g. `19319AA28`), resolved
  server-side. `period` defaults to `month`.
- Send the `x-api-secret` header when `PUBLIC_API_SECRET` is configured.

Returns **only** safe fields:

```json
{
  "success": true,
  "period": "week",
  "currentAmount": 840,
  "targetAmount": 5000,
  "percent": 17,
  "sDate": "2026-06-01 00:00:00",
  "eDate": "2026-06-07 23:59:59"
}
```

Errors return `{ "success": false, "message": "..." }` with an appropriate
status (400 missing userId, 401 bad/missing secret, 404/422 lookup, 502 backend,
500 unexpected).

### Security guarantees

The response **never** includes userId, username, phone, bank, the transaction
list, raw backend JSON, payload, token, or cookie. `currentAmount` is computed
server-side by summing completed DEPOSIT transactions within the period
(Malaysia time, UTC+8).

---

## How to deploy to Vercel

1. **Push to GitHub** — commit this project and push it to a GitHub repo.
2. **Import to Vercel** — go to [vercel.com/new](https://vercel.com/new), pick
   the repo. Vercel auto-detects Next.js (no build config needed).
3. **Add Environment Variables** (Project → Settings → Environment Variables),
   for the **Production** (and Preview) environment:
   - `BACKEND_ACCESS_ID`
   - `BACKEND_ACCESS_TOKEN`
   - `BACKEND_TK`
   - `PUBLIC_API_SECRET` — a long random string (this is the value your embed
     will send)
   - `ALLOWED_ORIGIN` — `*`, or your website origin like `https://www.example.com`
   - (optional) `USER_LOOKUP_MODULE`, `USER_LOOKUP_USERNAME_FIELD`
4. **Deploy** — click Deploy. You get a domain like
   `https://deposit-progress-api.vercel.app`.
5. **Verify** —
   `https://<your-domain>/api/deposit-progress?userId=19319AA28&period=week`
   with header `x-api-secret: <PUBLIC_API_SECRET>` should return JSON.

Re-deploy after changing env vars (Vercel → Deployments → Redeploy).

---

## How to embed on your website

A ready-made widget lives at **`public/embed-weekly-vip.html`** (served at
`https://<your-domain>/embed-weekly-vip.html`).

1. Open `public/embed-weekly-vip.html` and replace the two placeholders:
   - `YOUR_VERCEL_DOMAIN` → your deployed domain (no trailing slash)
   - `YOUR_PUBLIC_SECRET` → the same value as `PUBLIC_API_SECRET` in Vercel
2. Copy the `<div id="wvip-root">`, the `<style>`, and the `<script>` blocks
   into your member page (or `<iframe src=".../embed-weekly-vip.html">` it).
3. Make sure your member page stores the **logged-in user** in `localStorage`
   or `sessionStorage` under one of these keys — `USER`, `user`, or `member` —
   as a JSON object containing `id`, `userId`, or `username` (a plain string id
   also works). The widget reads it automatically; there is **no manual userId
   input** and the userId/username is never displayed.

Example of what your site should already have set after login:

```js
localStorage.setItem("USER", JSON.stringify({ username: "19319AA28" }));
```

The widget auto-refreshes every 10 seconds and shows only: this week's deposit,
the next bonus, the progress bar, and the milestone chests (highest tier only,
unlocks next Monday 12:00 AM).

### React version

For a React/Next.js site, use `components/FrontendWeeklyVipProgress.jsx`:

```jsx
import FrontendWeeklyVipProgress from "@/components/FrontendWeeklyVipProgress";

<FrontendWeeklyVipProgress
  apiBase="https://YOUR_VERCEL_DOMAIN"
  apiSecret="YOUR_PUBLIC_SECRET"
/>;
```

It reads the user from storage the same way and renders the same compact widget.

---

## Notes

- Weekly VIP Bonus is **highest-tier-only (not cumulative)**: reaching RM5,000 =
  RM500 only, not RM100+…+RM500.
- `targetAmount` is fixed at `5000`; `percent = min(round(currentAmount /
  targetAmount * 100), 100)`.
- The bundled test page (`app/page.jsx`) auto-refreshes every 10 seconds once a
  userId is loaded.

> ⚠️ Note on `x-api-secret`: because the embed runs in the browser, the secret
> is visible to anyone who inspects the page. It deters casual/cross-site abuse
> and (with `ALLOWED_ORIGIN`) limits browser callers, but it is not a true
> private secret. Do not treat it as authentication for sensitive data — the API
> is deliberately limited to non-sensitive deposit totals only.
