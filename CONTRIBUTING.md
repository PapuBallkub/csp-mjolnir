# Contributing

Three people work in this repo. These are the rules that keep `main` buildable
and the history readable — nothing beyond that.

## Layout

| Path | What it is |
| :--- | :--- |
| `client/` | Next.js frontend. Phase 1 mockups live in `client/app/mockups`. |
| `server/` | Node + Express API, and from Phase 2 the ingestion pipeline. |
| `server/src/common/` | Plumbing every feature uses: config, db, errors, middleware. |
| `server/src/models/` | Every Mongoose schema, in one place. Shape only, no logic. |
| `server/src/features/` | One folder per feature, each owning its routes, controller, and service. |
| `docs/decisions/` | Why we chose things. See [Decisions](#decisions). |
| `AGENTS.md` | Design guide for mockup and UI work, and what coding agents read first. Check it before touching `client/app/mockups`. |
| `CSP_Proposal.md` | The proposal — user stories (US1–US17) and requirements (FR01–FR15), which the code cites by number. |

`server/src` is sliced by feature, with the schemas kept together in one
`models/` folder. Two rules keep that from collapsing back into a pile: only the
feature that owns a collection writes to it, and a feature is imported through
its `index.js` and never by reaching into the files beside it. The reasoning is
in [0003](docs/decisions/0003-feature-based-server-layout.md).

## Getting set up

```
cd client && npm install && npm run dev     # http://localhost:3000
cd server && npm install && npm run dev     # http://localhost:8000
```

The server reads `server/.env`, which is gitignored. Copy the template and fill
in your own values:

```
cp server/.env.example server/.env
```

`MONGO_URI` is the Atlas connection string — ask in the team chat, and never
commit it. It is required: the server refuses to boot without it, and connects
before it starts listening, so a process that is up is a process that reached
Atlas.

`JWT_SECRET` signs the session cookie and is required for the same reason — a
development fallback is a hardcoded signing key, and a hardcoded signing key in
production lets anyone mint a session for any account. This one is yours alone,
not a shared value, so generate it and don't ask for anyone else's:

```
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

Running `npm test` in `server/` boots the app against whatever `MONGO_URI`
points at. The tests that write users send them to a separate `mjolnir_test`
database and delete them afterwards, so a local run never touches the shared
data — keep it that way when you add tests that write.

## Branches

Branch off `main`; don't commit to it directly. Name the branch for the change,
using the same type as the commit:

```
feat/mongodb-connection
fix/thai-date-formatting
docs/contributing-and-decisions
```

Open a pull request into `main` and have one of the other two look at it before
merging. A one-line typo fix is not worth the ceremony — merge your own.

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`.

| Type | For |
| :--- | :--- |
| `feat` | a new capability |
| `fix` | a bug fix |
| `refactor` | restructuring with no change in behaviour |
| `docs` | documentation |
| `chore` | dependencies, config, tooling |
| `test` | tests |

Scopes follow the folders. `client` and `docs` stay flat, but `server/src` is
sliced by feature, so scope a server commit by the feature it touches — `tors`,
`auth`, `matching`, and from Phase 2 `ingestion` and `ocr`. Keep `server` for
the skeleton itself: `app.js`, `common/`, `models/`, config.

Write the subject in the imperative, under roughly 50 characters:

```
feat(server): connect to MongoDB with Mongoose
fix(client): stop Thai titles clipping in the catalog card
```

**Commits say what changed. Docs say why.** Keep the body to a short list of
what moved; the diff covers the rest. Reasoning that someone will need in six
weeks belongs in `docs/decisions/`, where it can be found without already
knowing which commit to look inside.

## Decisions

When we pick between real alternatives — a library, a service, a data model —
record it in `docs/decisions/` as `NNNN-short-title.md`, numbered in order:

- **Context** — what forced the choice
- **Decision** — what we picked
- **Consequences** — what it costs, and what would make us revisit

Don't edit an old record when you change your mind. Write a new one and say it
supersedes the old one, so the reasoning at the time survives.
