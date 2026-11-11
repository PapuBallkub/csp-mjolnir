# GIPDP client

The web frontend: Next.js 16 (App Router), React 19 and Tailwind CSS 4. It
reads everything from the API in `server/`.

## Running it

Start the database and the API first (see [CONTRIBUTING.md](../CONTRIBUTING.md#getting-set-up)),
then:

```
npm install
npm run dev     # http://localhost:3000
```

| Script | What it does |
| :--- | :--- |
| `npm run dev` | Development server, with webpack |
| `npm run build` | Production build |
| `npm run start` | Serves the production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests in `test/`, with `node:test` |

## Settings

| Variable | Read | What it is |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | At **build** time, inlined | The API's origin as the browser sees it, e.g. `http://localhost:8000` |
| `API_INTERNAL_URL` | At run time | The API's origin from the client's own server, for pages that fetch there (the TOR detail page). Unset: `NEXT_PUBLIC_API_URL` |

Copy `.env.example` to `.env.local` to set them. Why they differ, and what a
wrong value breaks, is in §2 of the
[deployment checklist](../docs/deployment-checklist.md).

Open the app at `localhost:3000`, not `127.0.0.1:3000`. With the API on
`localhost:8000` the second is cross-site, and the browser silently drops the
session cookie: you look signed out right after signing in.

## Where things are

- `app/(app)/`: pages inside the site shell; `app/(app)/(private)/` needs
  sign-in. `app/auth/` and the introduction page (`app/page.tsx`) stand alone.
- `app/_components/`: shared UI, verdict badges, the shell.
- `app/_lib/api.ts`: every call to the API.
- `app/_data/tors.ts`: fixtures, still read by `/watchdog` and
  `/notifications`.

Every file, one line each: [docs/project-map.md](../docs/project-map.md).
Before changing anything in `app/`, read the design guide:
[AGENTS.md](../AGENTS.md).
