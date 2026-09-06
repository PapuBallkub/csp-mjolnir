# Contributing

Three people work in this repo. These are the rules that keep `main` buildable
and the history readable — nothing beyond that.

## Layout

| Path | What it is |
| :--- | :--- |
| `client/` | Next.js frontend. Phase 1 mockups live in `client/app/mockups`. |
| `server/` | Node + Express API, and from Phase 2 the ingestion pipeline. |
| `docs/decisions/` | Why we chose things. See [Decisions](#decisions). |
| `AGENTS.md` | Design guide for mockup and UI work, and what coding agents read first. Check it before touching `client/app/mockups`. |
| `CSP_Proposal.md` | The proposal — user stories (US1–US17) and requirements (FR01–FR15), which the code cites by number. |

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
commit it. Note that if it is unset the server falls back to a local `mongod`
and **still starts**, so a blank `.env` looks like a working API sitting on an
empty database. Check the console for `MongoDB connected` before assuming the
data layer is live.

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

Scopes follow the folders — `client`, `server`, `docs`. Phase 2 adds `scraper`
and `ocr`.

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
