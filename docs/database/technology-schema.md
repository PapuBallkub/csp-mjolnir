# Data Dictionary & Schema Specification: `Technology`

**File:** `server/src/models/technology.model.js`
**Model Name:** `Technology`
**Collection Name:** `technologies`
**Related Documents:** [TorInsight Schema](./tor-insight-schema.md), [0014 · Price names and insight data rules](../decisions/0014-price-names-and-insight-data-rules.md)
**Status:** Active

---

## 1. Overview

The shared vocabulary of technologies: one entry per technology, however TORs write it. "PostgreSQL", "Postgres" and "PostgreSQL 14" are one entry. Without it, search, matching and lock-spec would count them as three different things.

- **Owner:** the AI extraction pipeline writes it. Profiles read it, so a user's skills and a TOR's requirements use the same names.
- **Used by:** `TorInsight.technicalRequirements.requiredTechnologies[].name` holds an entry's `name`.

### How a name is matched

1. Lower-case it, trim it, and collapse repeated spaces.
2. Look for an entry whose `key`, or one of its `aliases`, is that exact text.
3. **Found:** use the entry's `name`.
4. **Not found:** create an entry with status `new`, and use it straight away.

A `new` entry is listed for someone to **merge** into an existing entry (its text becomes an alias there) or **confirm**. That's how OCR typos and duplicate spellings stay out of the confirmed list.

The version (for example `2019` in "Windows Server 2019") isn't part of the name. It's stored next to the name in `TorInsight`, because a required exact version is itself a lock-spec signal.

---

## 2. Fields

| Field | Type | Required / Indexed | Default | Description | Example |
|---|---|---|---|---|---|
| `name` | `String` | Required, Unique | — | Display name | `"PostgreSQL"` |
| `key` | `String` | Required, Unique | — | The name in matching form: lower-cased, trimmed | `"postgresql"` |
| `aliases` | `[String]` | Indexed | `[]` | Other ways TORs write it, in matching form | `["postgres", "pgsql"]` |
| `category` | `String` | No | `null` | Kind of technology | `"database"`, `"os"`, `"language"`, `"framework"`, `"platform"` |
| `status` | `String` | Indexed | `'new'` | `'confirmed'` once a person has checked it | `'confirmed'`, `'new'` |
| `firstSeenIn` | `String` | No | `null` | The `projectId` a `new` entry first came from | `"68039469567"` |
| `createdAt`, `updatedAt` | `Date` | — | automatic | Mongoose timestamps | |

---

## 3. Example Document (JSON)

```json
{
  "name": "Windows Server",
  "key": "windows server",
  "aliases": ["windows server os", "ms windows server"],
  "category": "os",
  "status": "confirmed",
  "firstSeenIn": null
}
```
