# 0006 · Local MongoDB for development, Atlas for shared data

Status: accepted · 2026-09-14 · supersedes part of
[0002](0002-atlas-over-local-docker-mongodb.md)

## Context

0002 pointed all three of us at one shared Atlas cluster, and listed the risk it
was accepting: *"Development needs a network connection. If that turns into a
real constraint, `docker run -d -p 27017:27017 mongo` gives a local instance
without changing a line of application code."*

It turned into a real constraint, but not through the door 0002 was watching.
The problem is not being offline. It is that the Atlas free tier (M0) only
accepts connections from IP addresses on its Network Access list, and a student
team's IP addresses move constantly — to campus, to a café, onto a phone
hotspot, and onto a fresh ISP lease every time the power cuts. Each move locks
somebody out of the database until another person signs into Atlas and pastes in
the new address. That is a person blocked on someone else being awake, several
times a week, for a reason that has nothing to do with the work.

Atlas can allowlist `0.0.0.0/0`, and that does make the symptom disappear in two
minutes. It is worth being clear that we are not choosing local Mongo because
the allowlist is unfixable. We are choosing it because the fix leaves a cluster
that accepts connections from the entire internet, guarded only by a password
sitting in three `.env` files that get pasted into chat and shown in
screenshots — and because development that stops working when a café's wifi
does was never a good trade for data we can regenerate.

## Decision

**Local MongoDB in Docker is the default for development. Atlas remains the
shared cluster, pointed at deliberately when the real scraped data is the point.**

The database lives in `docker-compose.override.yml`, which Compose loads on top
of `docker-compose.yml` automatically. `docker compose up` is therefore the
development stack; `docker compose -f docker-compose.yml up` is the production
one, which still has no database of its own.

Switching between local and Atlas is editing `MONGO_URI` in `server/.env`.
No application code knows the difference, exactly as 0002 predicted.

## Consequences

- **Docker Desktop is now on the critical path for the default setup**, which is
  the one thing 0002 was most concerned to avoid: *"No Docker Desktop to install
  and troubleshoot on three Windows machines."* That cost is real and it is
  being paid a phase earlier than planned. It is easier to justify now than it
  was in August, because 0002 also concluded that Phase 2's Thai OCR worker has
  to be containerized regardless — so this brings forward an install that was
  already coming, rather than adding a new one.
- **0002's strongest argument now applies to us: three databases that start
  empty.** It costs nothing today, because the only collection is `users` and
  there is no scraper yet — a local database and the Atlas one contain equally
  little. It starts costing the moment FR01 lands and comparing results means
  having the same TORs. **A seed dump has to exist before the scraper does**, or
  the first person to hit that will simply switch back to Atlas and take the
  allowlist problem with them.
- **There are now two connection strings that both mean "the local database",
  and picking the wrong one is the mistake everyone makes once.** A server run
  natively reaches it at `localhost:27017`; a server run inside Compose reaches
  it at `mongo:27017`, because `localhost` inside a container is that container.
  The override sets the container case itself, so the only one anybody types is
  the native one, and `.env.example` documents both.
- **The local database has no authentication and is published on
  `127.0.0.1:27017`, not `0.0.0.0:27017`.** Bound to loopback it is reachable
  from your machine and nothing else; bound to all interfaces an unauthenticated
  database would accept connections from everyone else on the café wifi — which
  would be a considerably worse version of the problem this record set out to
  solve.
- **`docker compose down` keeps your data; `docker compose down -v` deletes it.**
  The data sits in a named volume rather than the container.
- Tests get a disposable database to write to, which is what `mjolnir_test` and
  the read-only rule in `smoke.test.js` were working around. Both stay as they
  are — they are what makes pointing at Atlas safe on the days you do.
- Atlas M0 caps out at 512MB and pauses a cluster after 60 days idle. Phase 2
  puts OCR'd Thai text for thousands of documents somewhere, and it was not
  going to be there. This decision was arriving in Phase 2 regardless; the
  allowlist just set the date.
