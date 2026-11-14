# 0036 · The interface is Thai only

Status: accepted · 2026-11-13

## Context

`AGENTS.md` and the design document (§6.5.2) promised English as a complete
second language, behind a toggle. The requirements don't ask for it: NFR-15
asks only that Thai be the primary language of the interface, the
notifications and the AI summaries.

Commit `0f0d2d8` (2026-11-06) removed the toggle. `useLang()` in
`client/app/_components/prefs.tsx` always returns `th`, and `setLang` does
nothing.

Bringing it back costs more than it gives:
- **The content is Thai.** Titles, agencies, quotes and the AI summaries are
  in Thai, and extraction writes Thai only (`titleEn` isn't extracted). An
  English interface would change the labels around a TOR but not the TOR
  itself, so most of what the reader came for stays in Thai.
- **Every string twice.** Each label, empty state and error would need writing
  and checking in both languages, by a team of three.

## Decision

**The interface is Thai only. There is no language toggle.** New screens and
copy are written in Thai. Technology names stay as the TOR writes them, often
in English ("Windows Server 2019", "PostgreSQL"), as before.

This covers the interface only. The docs and the code comments stay in
English, with Thai terms inline.

## Consequences

- NFR-15 is met as written, so the SRS needs no change. `AGENTS.md` and the
  design document now say Thai only.
- **The client still carries English that nothing shows.** About 33 files
  have `Bi` values (`{ th, en }`) or `lang === "th" ? … : …` branches. `pick()`
  returns the Thai half, and `lang` is always `th`. Two tests still check both
  languages (`stage.test.ts`, `deadline.test.ts`). Removing all of this is
  cleanup, best done in a file when someone is working on it anyway. Until a
  type stops asking for `{ th, en }`, give it both halves. The English isn't
  shown, so it doesn't need polishing.
- **Server error messages are English.** [0012](0012-how-the-browser-holds-a-session.md)
  accepted that "in a bilingual UI". In a Thai-only interface they stand out:
  the sign-in form shows "Invalid email or password." under Thai labels. Two
  fixes would work. The server can write its messages in Thai, or it can send
  a code that the client turns into Thai, as 0012 proposed.
- **Revisit** if non-Thai readers become an audience, such as foreign vendors,
  or if extraction starts writing English summaries.
