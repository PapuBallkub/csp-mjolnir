# 0003 · Feature-based server layout, with schemas kept central

Status: accepted · 2026-09-08

## Context

`server/server.js` was 25 lines: connect, one route, listen. Phase 2 adds the
scrapers and the OCR/LLM pipeline, and Phase 3 lands profiles, search, and the
matchmaker more or less at once. Deciding the layout after that work starts
means moving live code while three branches are open on it.

The conventional alternative is to slice by layer — `controllers/`, `services/`,
`models/`, `routes/`. It reads well in a tutorial, but every feature then spans
four directories and every pull request touches the same four files. With three
people working in parallel on a 13-week schedule, that is a merge conflict a
week for no benefit.

Slicing by feature raises its own problem, though: scattering the Mongoose
schemas across seven feature folders makes the data model impossible to see. The
schema is the one thing all three of us need in our heads, and a Mongoose
relation is only ever written on one side, so the graph is not inferable from any
single file.

## Decision

Slice `server/src/` by feature, but keep every Mongoose schema together in
`src/models/`.

```
src/
├── server.js            entry: connect, then listen
├── app.js               builds the express app, no listen
├── common/              config, db, errors, middleware
├── models/              every schema, shape only
├── features/            one folder per feature, each owning its router
└── pipeline/            scrapers and OCR jobs, no routers (Phase 2)
```

Three rules:

1. **A collection has one owning feature, and only the owner writes to it.**
   Reads may cross a boundary; writes go through the owner's service. The
   pipeline calls `upsertTorFromExtraction()` rather than `Tor.updateOne()`.
2. **Cross-feature imports go through the feature's `index.js`**, never into the
   files beside it.
3. **`common/` never imports from `features/` or `pipeline/`.** If something in
   `common/` needs to know about a feature, it is not common.

## Consequences

- One person can own a feature folder for a week without touching anyone else's.
  Feature names also map onto the FR numbers the proposal already uses.
- Splitting `app.js` from `server.js` means the API can be driven by a test
  without binding a port. Nothing uses that yet; it costs one file to keep open.
- **File location does not enforce rule 1 — review does.** Mongoose resolves
  models through one global registry, so any feature can reach any model via
  `mongoose.model('Tor')` no matter where the file sits. This is worth being
  honest about: the directory structure documents the boundary, it does not
  defend it. If it starts being ignored, an ESLint `no-restricted-imports` rule
  on `*.model.js` is the enforcement step.
- Centralizing schemas costs the property that deleting a feature means deleting
  one folder. In a 13-week project where no feature gets deleted, that is not a
  real cost, and it buys a data model that fits on one screen.
- `src/models/index.js` is imported once at boot, which also fixes a failure mode
  we would otherwise have hit: `ref: 'Tor'` needs `Tor` registered before any
  populate runs, and a pipeline job can easily run before the API routes are
  first touched.
- Models hold shape only — fields, types, indexes, enums. The moment one grows a
  `Tor.statics.calculateLockSpecRisk()`, risk logic has moved into a directory
  everything imports, and we are back to layers with extra steps.
- `MONGO_URI` is now required and the server connects before it listens, so the
  trap that CONTRIBUTING.md and `.env.example` both used to warn about — a
  blank `.env` producing a healthy-looking API on an empty local database — is
  fixed rather than documented.
