# Contributing

Three people work in this repo. This page says where a newcomer starts, and
the rules that keep `main` buildable, the history readable and the docs true.

## Where to start

New to the project? In this order:

1. **Get it running.** Follow [Getting set up](#getting-set-up) below, then
   run `npm test` in `server/` and in `client/`.
2. **Read the overviews.** [docs/README.md](docs/README.md) lists four pages
   to read in order: the system on one page, the server's features, the data
   model, and the pipeline. Keep the [glossary](docs/glossary.md) open beside
   them for ราคากลาง, ว 214 and the e-GP codes.
3. **Read the page for what you're about to change.** The
   [Find your way](docs/README.md#find-your-way) table points to it. For
   anything in `client/app/`, read [AGENTS.md](AGENTS.md) first.
4. **Find the file.** [docs/project-map.md](docs/project-map.md) gives every
   file one line. Its "Before you trust a file" section lists the duplicates
   and leftovers not to copy from.
5. **Look up the requirement.** Comments cite IDs such as `FR-19`;
   [docs/requirements.md](docs/requirements.md) says what each one means.

If a doc turned out wrong while you did this, fix it in your first PR. It's
one of the most useful first contributions there is.

## Layout

| Path | What it is |
| :--- | :--- |
| `client/` | Next.js frontend. Pages live in `client/app/(app)/` (shell-wrapped) and `client/app/` (standalone). |
| `server/` | Node + Express API, and the pipelines in `server/src/pipeline/`. |
| `docs/README.md` | The front door to the docs: what to read first, where to look for what, and how to write docs here. |
| `docs/project-map.md` | Every file in the repo, one line each, and where to start for common tasks. |
| `docs/pipeline.md` | What each pipeline command does, its options, and its settings. |
| `server/src/common/` | Plumbing every feature uses: config, db, errors, middleware. |
| `server/src/models/` | Every Mongoose schema, in one place. Shape only, no logic. |
| `server/src/features/` | One folder per feature, each owning its routes, controller, and service. |
| `docs/decisions/` | Why we chose things. See [Decisions](#decisions). |
| `docker-compose.yml` | The production stack. `docker-compose.override.yml` adds the local database on top of it, and Compose loads it automatically. |
| `docs/deployment-checklist.md` | What has to be set and verified before a production deploy. Read it before the first one, and before every one after. |
| `AGENTS.md` | What coding agents read first: the rules for every change (databases, scripts, packages, secrets, access), then the design guide for frontend UI work. Check the design guide before touching `client/app/`. |
| `docs/requirements.md` | What the product has to do — the public summary of our SRS, with every requirement by the ID the code cites (`FR-01`–`FR-24`). Older citations use the proposal's numbering; the table at its end translates them. |
| `context/` | Local only, and gitignored: the full SRS and working notes, for discussion before anything is written up in `docs/`. Never commit it or link to it. |

`server/src` is sliced by feature, with the schemas kept together in one
`models/` folder. Two rules keep that from collapsing back into a pile: only the
feature that owns a collection writes to it, and a feature is imported through
its `index.js` and never by reaching into the files beside it. The reasoning is
in [0003](docs/decisions/0003-feature-based-server-layout.md).

## Getting set up

The database runs in Docker and everything else expects it to be there, so start
it first:

```
docker compose up -d mongo                  # mongodb://localhost:27017
```

Then the two apps, natively:

```
cd client && npm install && npm run dev     # http://localhost:3000
cd server && npm install && npm run dev     # http://localhost:8000
```

`docker compose up` on its own runs all three in containers instead. Stopping
with `docker compose down` keeps your data; `docker compose down -v` throws it
away and gives you an empty database.

The server reads `server/.env`, which is gitignored. Copy the template and fill
in your own values:

```
cp server/.env.example server/.env
```

`MONGO_URI` points at the local database by default and needs no secret. Point
it at the shared Atlas cluster on the days you want the real scraped data — ask
in the team chat, never commit it, and note that your current IP has to be on
the Atlas allowlist, which is the reason local is the default. Either way it is
required: the server refuses to boot without it, and connects before it starts
listening, so a process that is up is a process that reached a database. The
reasoning is in [0006](docs/decisions/0006-local-mongodb-for-development.md).

`JWT_SECRET` signs the session cookie and is required for the same reason — a
development fallback is a hardcoded signing key, and a hardcoded signing key in
production lets anyone mint a session for any account. This one is yours alone,
not a shared value, so generate it and don't ask for anyone else's. It must be
at least 32 bytes, or the server refuses to boot; this command gives 72
characters:

```
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

`PASSWORD_PEPPER` keys the HMAC every password goes through before bcrypt
([0039](docs/decisions/0039-passwords-are-peppered-before-bcrypt.md)). It is
required, yours alone like `JWT_SECRET`, and at least 32 bytes; this command
gives 44 characters:

```
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

Unlike `JWT_SECRET`, keep it once set. Every password hash on your database
depends on it, so a new or lost pepper means every password account there
stops working (Google sign-in doesn't), and each has to be registered again.

Signing up doesn't sign you in. It emails a confirm link, and the account
exists once you open it and type the same password again
([0041](docs/decisions/0041-an-address-is-confirmed-before-the-account-exists.md)).
You don't need a mail account for that locally: with `SMTP_USER` and
`SMTP_PASS` unset, the server prints the link to its log instead, on a line
starting `[auth] Development only, no SMTP`. Production never does; there,
sign-up needs SMTP. An account you made before this change can be claimed:
register again with the same address and confirm, and its role and profile
stay.

Reset links work the same way: without SMTP, `/auth/forgot` prints the link
on the same kind of line, as a `reset link`. A new password has to pass the
policy in [0042](docs/decisions/0042-passwords-can-be-changed-reset-and-checked.md): at least 8 characters, not a
common password, and not GIPDP's name, your email's name or your own name
with digits or symbols around it. An old password that fails it still signs
in.

Running `npm test` in `server/` boots the app against whatever `MONGO_URI`
points at. The tests that write users send them to a separate `mjolnir_test`
database and delete them afterwards, so a run against Atlas never touches the
shared data — keep it that way when you add tests that write. A test that needs
someone signed in gets a confirmed account from `server/test/helpers/accounts.js`
(`signedInAccount`) rather than registering, since registering no longer signs
anyone in; its `createMailRecorder` stands in for the mailer.

The tests never need ClamAV, the virus scanner: they pass in a fake one. You
need it only to run the pipeline's download steps for real, or to see document
previews, since the preview shows only files the scanner passed
([0040](docs/decisions/0040-files-are-scanned-before-they-are-kept.md)). It
takes 3–4 GB of memory, so `docker compose up` leaves it out:

```
docker compose up -d clamav                 # first start downloads signatures, a few minutes
```

Then set `CLAMD_HOST=127.0.0.1` in `server/.env`, and check it with
`npm run ingest:scan -- --self-test` from `server/`. Without `CLAMD_HOST` the
pipeline still runs and keeps new files marked unscanned; `npm run ingest:scan`
scans them later. That command writes to the database and deletes any file
ClamAV flags, so check where `MONGO_URI` points before running it.

## Admin accounts

Every account is created as a plain `user`. There is no way to sign up as an
admin, and no route that grants it — a platform admin is one of us, not a thing
the product offers. Grant it against the database:

```
cd server
npm run role -- someone@example.com admin
npm run role -- someone@example.com user    # and back again
```

The change takes effect on that person's next request, since `requireAuth`
re-reads the account every time. See
[0011](docs/decisions/0011-a-name-and-a-role-on-the-account.md) for why this is
a command rather than an `ADMIN_EMAILS` variable.

## Branches

Branch off `main`; don't commit to it directly. Name the branch for the change,
using the same type as the commit:

```
feat/mongodb-connection
fix/thai-date-formatting
docs/contributing-and-decisions
```

Open a pull request into `main` and have one of the other two look at it before
merging. The description starts from
[the template](.github/pull_request_template.md): what changed, why, how to
test it, and which docs changed. Give the commands you ran, not only their
result, so the reviewer can run them too. A one-line typo fix is not worth the ceremony — merge your own.

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
sliced by feature, so scope a server commit by the feature or pipeline it
touches — `tors`, `auth`, `match`, `admin`, `watchlist`, `ingestion`,
`extraction`, or `pipeline` for the jobs and work across both pipelines. Keep
`server` for the skeleton itself: `app.js`, `common/`, `models/`, config.

Write the subject in the imperative, under roughly 50 characters:

```
feat(server): connect to MongoDB with Mongoose
fix(client): stop Thai titles clipping in the catalog card
```

**Commits say what changed. Docs say why.** Keep the body to a short list of
what moved; the diff covers the rest. Reasoning that someone will need in six
weeks belongs in `docs/decisions/`, where it can be found without already
knowing which commit to look inside.

## Docs are part of the change

The docs are how the next person learns the code. That person may be a
teammate, someone reviewing the project, or a coding agent. An agent reads
`AGENTS.md` and `docs/` before the code and trusts what they say. A missing
doc slows people down. A wrong one sends them the wrong way, and an agent acts
on it without asking. So a change isn't finished until the docs it touched are
right.

In the same PR:

- **Fix what your change made wrong.** Search the docs for every name you
  renamed, removed or gave a new meaning to: a field, a route, a setting, a
  command.

  ```
  git grep -n "SESSION_TTL_DAYS" -- docs AGENTS.md CONTRIBUTING.md
  ```

- **Update the reference page.** A field goes on its page in
  `docs/database/`. A pipeline command, option or setting goes in
  `docs/pipeline.md`. A feature goes in `docs/overview/server-features.md` and on its
  page in `docs/features/`.
- **Add a new file to [project-map.md](docs/project-map.md).** If it's a doc,
  add it to [docs/README.md](docs/README.md) as well.
- **Record a choice between real alternatives** as a decision
  ([below](#decisions)).
- **Write down what took you a while to work out.** If you needed an hour to
  learn why the code does something, the next person will need that hour too.
  Put it on the page they'd open first. If no page fits, ask where it should
  go.

The PR template's Docs section asks which docs you updated. If none, write
"none affected". Reviewers check it against the diff.

Docs-only PRs are welcome. A doc that's out of date is worth a PR on its own,
with the commit type `docs`. How to write them is in
[Writing docs here](docs/README.md#writing-docs-here): one home per fact,
every claim checked against the code, Mermaid for diagrams, and English with
Thai terms inline.

## Decisions

When we pick between real alternatives — a library, a service, a data model —
record it in `docs/decisions/` as `NNNN-short-title.md`, numbered in order.
Take the next free number on `main`, and check the open pull requests too. A
branch once took 0030 after `main` already had it, which is why lock-spec's
record is now 0035.
Each record has three parts:

- **Context** — what forced the choice
- **Decision** — what we picked
- **Consequences** — what it costs, and what would make us revisit

Don't edit an old record when you change your mind. Write a new one and say it
supersedes the old one, so the reasoning at the time survives.
