# 0014 · Price names, and the data rules for TorInsight

Status: accepted · 2026-10-01

## Context

[0013](0013-split-ingestion-and-ai-extraction.md) has the AI pipeline write
`TorInsight`. Before it writes anything, the schema has to stop saying things
the TOR never said. Reading the models against real TORs turned up four
problems.

**Two prices were mixed up.** A Thai TOR carries two different figures:
- **งบประมาณ**, the budget the agency has set aside
- **ราคากลาง**, the reference price the agency's committee works out, which bids
  are judged against

`Tor` stored ราคากลาง as `medianPriceTHB`, because กลาง reads as "middle", but
it isn't a median of anything. `TorInsight` used the same name, `medianPriceTHB`,
for *our* median of similar past projects. So the same field name meant the
agency's figure in one model and ours in the other. Code like
`insight.medianPriceTHB = tor.medianPriceTHB` would look right and store the
wrong number.

**Defaults invented facts.** A missing price defaulted to `0`, the status to
`'Open'`, and the evaluation method to `'Price'`. Each one reaches the page
looking like something the agency stated: ฿0, a closed tender shown as open.

**Nothing said where a value came from.** A reviewer, or the grounding check,
had no quote or page to check an extracted value against.

**The same technology had many names.** "PostgreSQL", "Postgres" and
"PostgreSQL 14" would be counted as three technologies by search, matching and
lock-spec.

## Decision

**Four prices, one name each.** Our own numbers live only in `analytics`, never
in `facts`.

| Price | Set by | Name | Where |
|---|---|---|---|
| Budget (งบประมาณ) | The agency | `budgetTHB` | `Tor`, `TorInsight.facts` |
| Reference price (ราคากลาง) | The agency's committee | `referencePriceTHB` | `Tor`, `TorInsight.facts` |
| Contract price (ราคาตกลงซื้อ/จ้าง) | The bidding result | `contract.agreedPriceTHB` | `Tor` |
| Median and average of similar past projects | GIPDP | in `analytics.priceAnalysis` | `TorInsight` |

Price analysis (FR-19) compares this TOR's ราคากลาง with the ราคากลาง of similar
past projects, and shows contract prices as context. It describes the gap and
leaves the judgement to the reader.

**Missing is `null`, never a plausible default.** Every price, date, number and
single text value defaults to `null`, and lists default to `[]`. A feed that
gives no figure stores `null`, not `0`. The `status` of an insight is required
and copied from `Tor`.

**Evidence travels with the value.** `TorInsight.evidence` maps a field in
`facts` to `{ quote, page }`. Values copied from the feed carry none, because
the feed is their source.

**Review state lives in `metadata`:**
- `promptVersion`
- `sourceFingerprint`: a hash over the main PDF's hash and any amendment
  documents' hashes, so a new amendment file triggers re-processing without a
  schema change
- `confidenceScore`, on a 0–100 scale
- `checks`, the failed ones only
- `reviewStatus`, `reviewedBy` and `reviewedAt`
- `excluded`, the reason a document isn't IT

**One vocabulary for technologies.** The `technologies` collection holds one
entry per technology, with the other ways TORs write it as aliases. A name that
matches nothing becomes a `new` entry, used straight away and listed for someone
to merge or confirm. `requiredTechnologies` stores `{ name, version }`, with the
version kept apart. Only technologies get a vocabulary for now.

**`webUrl` is built, never extracted.** `egpAnnouncementUrl(projectId)` in
`pipeline/shared/` builds the e-GP page link. `sourceUrl` keeps the feed's own
link for tracing.

## Consequences

- **Existing `Tor` records keep the old field name.** The only ones so far are
  local test records, so they're cleared and fetched again rather than migrated.
  A database with data worth keeping would need a one-off rename script.
- **Code must handle `null` wherever it reads a price.** Maths on a `null`
  budget has to be skipped, not treated as zero. That's the price of the page
  being able to say "not specified".
- **`requiredTechnologies` changed shape**, from strings to `{ name, version }`.
  The API has to join them back into "Windows Server 2019" for display.
- **The vocabulary needs a person.** `new` entries pile up until someone merges
  or confirms them. There's no admin screen for that yet, so it's done by hand
  for now.
- **`analytics` still has `0` defaults.** It's reshaped when price analysis and
  lock-spec are built. Until then, nothing may display it as if it were
  measured.
