# 0034 · A TOR can have several categories, main one first

Status: accepted · 2026-11-06 · updates [0021](0021-find-comparable-projects.md), [0022](0022-precompute-benchmarks-in-the-pipeline.md), [0030](0030-lock-spec-risk-criteria-and-scoring.md) and [0031](0031-keep-the-summary-a-change-replaces.md)

## Context

A TOR had exactly one category, out of 7. Many TORs are two kinds of work at once: "build an HR system and maintain it for 3 years" is both `software-development` and `maintenance-and-support`. The AI had to drop one.

That hurt the comparison (FR-19), which only looked at past projects with the *same* category. When work fits two categories, which one the AI picks is close to a coin toss, so two near-identical TORs could end up with different labels and never see each other.

The category also came from the classify step, which reads only the first 10,000 characters of a TOR. What shows a second kind of work (years of maintenance, licences) usually sits in the scope and deliverables, further in.

## Decision

### 1. `identification.category` becomes `identification.categories`

A list of 1 to 3 of the same 7 values, the main kind of work first, `[]` when there is none. The order means something: comparisons score it and lock-spec reads the first.

It's a new name, not only a new type. Mongo's `{ 'identification.category': 'x' }` matches a list that contains `x`, but JavaScript's `category !== 'x'` is always true for a list. The comparison did both, so keeping the name would have made its two paths disagree with no error. With a new name, a reader we missed gets `undefined` and fails a test.

`PROJECT_CATEGORIES` moved to `models/project-categories.js` so the model can refuse anything else. That ends `'non-IT'`, `'IT / software'` and the admin form's made-up values.

### 2. The extract step gives them

Extract reads the whole TOR anyway, so this adds no Gemini call (`extract-v6`). Classify now only decides what's in scope.

The title screen stays as it is, one category from the title (`screen-v2`): moving it to a new version would re-screen every title, new and past. A title-only record wraps that value in a list.

A warranty that comes with a system doesn't make it `maintenance-and-support`. The schema tells Gemini so, because nearly every TOR has one, and a tag on every record tells comparisons nothing.

### 3. Comparisons: share at least one, and closer lists score higher

**The filter** keeps a past project if it shares at least one category.

**The score** gains a fourth part, which rewards sharing more and in the same order:

```
S = 0.35 Archetype + 0.30 Complexity + 0.20 Tech + 0.15 Category
Category = overlap × order
```

- **overlap:** shared categories ÷ all categories in either list, the sum the Tech part uses.
- **order:** for each shared category, same position scores 1, one apart 0.75, two apart 0.5; then the average.

Overlap is multiplied by order, not combined with it by weighting each position, so that sharing both of two categories in swapped order (0.75) still beats sharing only the main one (0.5).

Category is the smallest part because it's a broad label, and deliverables drive cost (ADR 0021). At 15% it can't lift a project past one with the right archetype.

Past-project selection uses the same filter and the same score, so the two never disagree.

### 4. Lock-spec: the reseller-letter rule reads the main category

In this order:

1. `categories[0]` is `software-licenses`: not flagged, because a reseller letter can belong to buying licences.
2. `categories[0]` is `software-development` or `systems-integration`, or the contract is `hire`: flagged, even with licences further down the list. In that case the finding says why the letter still matters: it may fit the licence part, but ว 214 ข้อ 1.3 doesn't let it limit who can bid on the rest.

The rule had always read `procurementKind`, but that field lives on `Tor` and lock-spec runs on the TorInsight record, so the `hire` half never fired. `facts.procurementKind` is now copied from the `Tor`. Every `hire` TOR asking for a reseller letter now gets the `high` finding ADR 0030 always described, and the findings change accordingly.

### 5. Reclassify stops overwriting the category

`metadata.excluded` was already what hides a TOR, and nothing read `'non-IT'` except the code that restored the category afterwards. Reclassify now leaves the categories alone, so undoing it loses nothing.

The review form uses numbered tick boxes: the order ticked is the order saved. The dropdown it replaces offered values that aren't categories, and published a TOR when "Out of Scope" was chosen with Approve.

### 6. Kept versions move to the new shape too

`npm run migrate:categories` converts `TorInsightVersion` by the same rule as `TorInsight`, so there is one shape to read. Old versions wouldn't break as they are, because `insight` is Mixed, but a rollback reads one through the model, which would quietly drop `category`. Converting at rollback time would be a second copy of the rule, and a weaker one: it can't take a real category from an earlier version when the one being restored holds `'IT / software'`.

This narrows [0031](0031-keep-the-summary-a-change-replaces.md): a version still keeps what the summary said, but not the field name it said it under. Only `category` and `facts.procurementKind` change. The reason, the OCR text and everything else stay.

A summary replaced after the migration needs nothing, because `keepVersion` copies the record as it stands. The code goes out before the migration runs, so the migration also covers that gap:

- A summary replaced in the gap moves in the old shape. The migration catches it.
- An admin's edit in the gap leaves both `category` and `categories` on the record, and the version it keeps can hold `category` beside an empty list. A list with values in it wins, so the edit isn't lost.

## Consequences

- **Near-twins find each other,** and a TOR with a second kind of work reaches past projects under either.
- **More lock-spec findings,** from the `hire` check working for the first time.
- **Old records score lower until read again.** A record from before `extract-v6` holds one category, so it can't fully match a two-item list. `npm run extract -- --outdated` fixes that, at the cost of Gemini calls.
- **Old shapes stay in two places, on purpose,** and each is converted by `cleanCategories`: saved Gemini answers (for `--recheck`), and title screens.
- **Run the migration before anyone rolls a TOR back.** Nothing else reads the old shape, so a rollback to a version it hasn't reached loses that version's category.
- **Stored results lag.** Prices and lock-spec findings are stored on the record (ADR 0022), so `npm run migrate:categories` must be followed by `npm run comparable -- --all --save`.

## Still to check

ADR 0030's summary of ว 214 says ข้อ 1.1 allows a reseller letter only for งานซื้อครุภัณฑ์หลัก, and that ข้อ 1.3 also covers งานซื้อพัสดุทั่วไป. Whether a software licence counts as ครุภัณฑ์หลัก has to be read from the circular itself. Rule 1 stands either way, because it only means we don't flag the TOR. It's not a statement that the letter is allowed, and the docs and the page shouldn't say so.
