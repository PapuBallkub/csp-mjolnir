<!--
Fill in what applies and delete the rest. Text between these marks doesn't
show in the PR.
-->

## What changed

<!-- A short list. The diff covers the detail. -->

-

## Why

<!-- The requirement (FR-19, NFR-17) or the issue. "Closes #12" closes the issue when this merges. -->

## How to test

<!--
For code changes. Docs only? Write "Docs only" and delete the rest of this
section.

Give the commands a reviewer can copy, not only the result. Add any your
change needs, such as a seed script or a pipeline step. Run them from the
repository root; they work in PowerShell, cmd and bash.
-->

**On your machine** (the database in Docker, the apps on Node):

```
docker compose up -d mongo
npm --prefix server test
npm --prefix client run lint
npm --prefix client test
```

**All in Docker** (`--build` because the images copy the code, so they need
rebuilding after a branch switch):

```
docker compose up -d --build
docker compose exec server npm test
```

<!-- The client image holds only the built app, so the client's lint and tests run on your machine. -->

**By hand:**

<!-- What to open or run, and what you should see. For example: "Open http://localhost:3000/search and pick ยื่นข้อเสนอภายใน 7 วัน: only TORs with bids due within a week are listed." -->

**Result:**

<!-- The summary lines from your run, e.g. "server: pass … fail 0 · client: pass … fail 0". -->

## Docs

<!-- Which pages you updated, or "none affected". CONTRIBUTING.md, "Docs are part of the change", says what to check. -->

<!--
Only if they apply:
- UI change: a screenshot at phone width (NFR-13)
- A choice between real alternatives: a record in docs/decisions/
- A file added, moved or deleted: its row in docs/project-map.md
-->
