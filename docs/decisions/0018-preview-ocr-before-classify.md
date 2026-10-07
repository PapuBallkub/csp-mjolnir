# 0018 · Read a preview, classify it, then read the rest

Status: proposed · 2026-10-08

## Context

Users want projects they can bid on now. The e-GP feed gives us those, but
most of its items aren't IT: on 2026-10-07, 2 of 40 opening items were. A
keyword on the title can't tell which ones are. `คอมพิวเตอร์` missed a
software licence, and caught a lung tester; broader words like `ระบบ` caught
water pipes and solar panels.

The team wants the AI to decide from the document, not the title, and to
find out from real data how many IT TORs have titles that don't look it
("มี TOR มากแค่ไหนที่ชื่อไม่เกี่ยวกับ IT แต่เป็น IT?"). That needs an
unfiltered intake: a keyword filter in front would hide exactly those cases.

Reading every document in full can't work on one machine. Most are scans
(8 of the 9 we had), at 3.8 s a page and 28–83 pages each. But the classify
step only ever reads the first 10,000 characters, about 5 pages.

## Decision

**Read a preview, let the AI classify it, and read the rest only for IT.**

```
fetch → download → preview OCR (6 pages) → classify ─┬─ not IT: excluded, stop
                                                      └─ IT: full OCR → extract
```

- **Fetch** takes every opening item from the e-GP feed: no keyword by
  default (`--query` stays, optional), and no cap on new projects unless
  `--limit` is given. data.go.th is unchanged.
- **The contract's kind** is read from the title: จ้าง (hire, a job), ซื้อ
  (buy, supplying goods) or เช่า (rent), stored as `Tor.procurementKind`.
- **Download and OCR only workable TORs:** Draft or Open, announced by the
  feed at least once, and with no contract winner. Anything else is past,
  whatever its stored status says.
- **Preview OCR** reads the first 6 pages of a scan (`ocr_preview`,
  `ocr.preview`). A digital PDF, or a scan of 6 pages or fewer, is read whole
  (`ocr_done`).
- **Classify** runs on the preview. Not IT: the insight is `excluded`, and
  the TOR stops there. IT: the insight is marked `awaitingFullText`, and the
  public doesn't see it yet.
- **Full OCR** reads the previews classified IT. The new text changes the
  source fingerprint, so extraction runs on its own next time.
- **Extraction never extracts from a preview.** It refuses one, the way it
  treats truncated text: fail closed.
- **Previews are kept,** text and PDF, for the team's study of titles against
  content.
- `npm run pipeline` runs ingest, extract, full OCR and extract in one go, so
  a TOR goes from the feed to the catalog in one run.

## Consequences

- **A non-IT TOR costs one download, about 6 pages of OCR (~23 s for a scan)
  and one classify call.** In the first live run, a 30-page scan of a public
  toilet was dropped after 6 pages.
- **"IT" means software and IT services, on purpose.** The classify prompt
  excludes pure hardware purchases: it dropped 261 UPS units and a radiology
  computer as "no system development or IT service". That's what we want: the
  course asks us to build for software engineering graduates looking for
  work, and supplying hardware isn't that work. Hardware and licence resellers
  aren't an audience for now.
- **Few results per run.** Each request to the feed returns 20 items, and
  about 1 in 20 opening items is IT. 10–20 IT TORs need a few hundred
  previews, over days of runs in the feed's open hours.
- Insights now have three states before review: excluded, awaiting full text,
  and extracted.
