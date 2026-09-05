# 0002 · MongoDB Atlas over a local Docker instance

Status: accepted · 2026-08-31

## Context

The proposal names MongoDB Atlas, but Docker deserved a second look before
Phase 2 starts. It would make the database reproducible across three machines,
remove a network dependency from local development, and is the setup most
backend tutorials assume.

## Decision

Point all three of us at one shared Atlas cluster. Don't containerize the app.

## Consequences

- We read and write the same scraped TORs. With a local Mongo per machine,
  every database starts empty and the scraper has to be run three times before
  anyone can compare anything — which is most of Phase 2's working time.
- No Docker Desktop to install and troubleshoot on three Windows machines
  inside a 13-week schedule. Node and Next both run natively without complaint.
- The connection string is a shared secret. It lives in `server/.env`, which is
  gitignored; the keys it needs are documented in `server/.env.example`.
- Development needs a network connection. If that turns into a real constraint,
  `docker run -d -p 27017:27017 mongo` gives a local instance without changing
  a line of application code — but then there are two databases to keep
  straight, and the shared data advantage above is gone.
- **Revisit Docker for OCR, not for the database.** Thai OCR in Phase 2
  (Tesseract with `tha` traineddata, or PaddleOCR) is a native-dependency
  install that will behave differently on each of our machines for reasons
  nobody can reproduce. That worker is the piece worth containerizing, and it
  is a much easier sell than "learn Docker before we can connect to a
  database."
