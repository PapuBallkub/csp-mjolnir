# 0001 · Mongoose over the MongoDB driver

Status: accepted · 2026-08-31

## Context

Every TOR in this database is written by the pipeline in FR03–FR05: a scanned
Thai PDF goes through OCR, then through an LLM that returns structured fields.
That output is unreliable in specific, predictable ways — a budget that comes
back as the string `"12,400,000"` rather than a number, a missing deadline, a
status that is not one of the five values FR09 allows.

Nothing downstream tolerates any of that. The catalog sorts on `deadline` and
branches on `status`; a document missing either breaks the page rather than
degrading gracefully. And the platform's whole claim is that you can trust the
summary instead of opening the PDF — a wrong ราคากลาง is worse than no listing.

The normalized shape in FR05 is also genuinely nested: `lockSpec.reasons[]`,
`price.comparables[]`, `amendments[].changes[]`. Validating that by hand against
the native driver is a lot of code, kept in step with the schema by discipline
alone.

## Decision

Use Mongoose. The `mongodb` driver still does the work underneath — Mongoose
adds a schema layer on top of it, so this is not a choice between two drivers.

Enums cover the five lifecycle states and the three lock-spec risk levels.
`required` enforces the fields the UI assumes are always present. Type coercion
catches the string-shaped numbers.

## Consequences

- A bad extraction fails at the write boundary, inside the pipeline, where
  there is a log and an admin review queue — instead of on an applicant's
  screen.
- The schema file becomes the data model's documentation. Anyone on the team
  can read it without reverse-engineering whoever wrote the last insert.
- `Model.aggregate()` passes raw pipeline stages straight through, so FR12's
  historical-median grouping is unaffected by this choice.
- Per-document validation costs something on bulk writes. Irrelevant at our
  volume: the BMA posts four to six IT projects a week.
- **Watch out.** `strict: true` is the default, and it *silently drops* fields
  the schema doesn't declare — no error, no warning. If the LLM returns
  something we haven't modelled, it vanishes. Keep the raw extraction in its
  own field or collection so the original is always recoverable when we are
  debugging why a TOR came out wrong.
