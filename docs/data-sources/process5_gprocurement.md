# process5: e-GP's documents

`process5.gprocurement.go.th` is e-GP's newer system. It holds the documents
behind every feed item: the announcement, the bidding document, the TOR and the
price form. This page says which services we call, what each document holds,
and how we know. The feed is in [process3_gprocurement.md](process3_gprocurement.md);
how the pipeline runs is in [pipeline.md](../pipeline.md).

**Last checked 2026-10-11.** We checked 8 packages (2 invitations, 6 drafts),
one more invitation's PDF and one winner page. Each fact names its source:
- **Seen:** observed in a response, with the date.
- **Code:** what our code does, mostly in
  `server/src/pipeline/ingestion/lib/tor-downloader.js`.

## What we call

These answer a plain `GET` with no account, token or key (seen 2026-10-11):

| Service | Request | Returns |
|---|---|---|
| Announcement package | `/egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=` | JSON with `zipId` and `buildName1` (e.g. `69109028093_07102569.zip`, the date it was built). For a draft, the draft's zip; for an invitation, the invitation's. |
| Price package | `/egp-doc-price-estimate-service/dpe-common/infoDocPriceestZipHis?projectId=` | JSON with `zipFileId` and `zipFileName` (`pricebuild_<unit>_<projectId>.zip`). Separate from the announcement, and present from the draft stage. |
| Download | `/egp-upload-service/v1/downloadFileTest?fileId=` | The zip (`application/zip`). Use `zipId` or `zipFileId`. |
| Invitation PDF | `/egp-template-service/dwnt/view-pdf-file?templateId=` | The invitation announcement as a PDF. This is the link a `D0` feed item carries, so one request gets the announcement without the zip. |

Example, from 2026-10-11:

```json
{"response":{"responseCode":"0","messageCode":"I0001","description":"สำเร็จ"},
 "data":{"projectId":"69109028093","buildName1":"69109028093_07102569.zip",
         "buildName2":"4cbc6829-8461-4da5-b96f-96320e693c20","buildName3":null,
         "buyerDownload":null,"merchantDownload":null,"pathFile":null,
         "zipId":"91440371862845cc9281dc637dd73296"}}
```

When there's nothing, the service still answers `200`, with `responseCode` `"1"`
and `"ไม่พบข้อมูลตามเงื่อนไขที่ระบุ"`.

### Answer, but not used yet

| Request | What we saw |
|---|---|
| `/egp-approval-service/apv-common/infoProcureDocAnnounZipTemp?projectId=` | The same as `infoProcureDocAnnounZip` for a draft |
| `/egp-approval-service/apv-common/infoProcureDocAnnounZipAdj?itemNo=&projectId=` | Probably amendments: "not found" for a project never amended. Untested on an amended one. |
| `/egp-aann23-service/pb/announce-history-doc/get-procure-announ-history-doc?announceType=&projectId=&seqNo=` | Announcement history: `data: null` for every call so far |

### Not called

e-GP's public website (`/egp-agpc01-web/`) loads Cloudflare Turnstile. Some of
its services need a token from that check or an API key embedded in the site's
code:
- `egp-oann10` `getTorZipList` and `getProcureResult`: token
- `listProjectPriceBuildZipByProjectId`: key
- `infoCommentReview` and `infoAnswerCommentReview`: key

**We don't call them.** Using them would get around e-GP's access control.

## What's in a package

### Announcement zip

The two invitation zips held 16 and 17 files. **13 files were byte-identical
blank forms in both**:
- the bonds (`Bid Bond`, `Performance Bond`, `Advance Payment Bond`)
- `contract_24`, `definition_1`/`2`, `Document Part1`/`2` and `performance`
- `quotation`, `bidding noltice` (general instructions) and
  `Domestic material use plan`
- `action_plan.xlsx`, a road-construction template even in a software project

One zip also held a `Retention Bond` form.

**Four files are about the project:**

| File | Format | What it holds |
|---|---|---|
| `annoudoc_<unit>_<projectId>.pdf`, the announcement (2 pages) | Real text | ราคากลาง; bid date and time (blank in a draft); agency; bidding-document number; "ประกาศขึ้นเว็บวันที่" |
| `doc_<unit>_<projectId>.pdf`, the bidding document (13–30 pages) | Real text | Bid date again; registered capital (e.g. ≥ 1 million baht); past-work minimum (e.g. ≥ 2,000,000 in one contract within 5 years); joint ventures; how the winner is chosen; payment installments; performance bond %; warranty; subcontracting penalty |
| The TOR, under any name: `Attach_TOR_1.pdf`, `TOR Smart Touchpoint.pdf`, `PPC.29092569.pdf` | **Often a scan** (6 of 8) | Scope, deliverables, technical requirements; sometimes the budget |
| `Attach_PUB_1.pdf` and similar (sometimes) | Real text | Agency extras; one was a bid-bond payment form |

**Reading the files:**
- **Filled-in values come out of order.** The announcement and bidding document
  are filled-in forms, so their text lists the values after the template
  wording: "ในวันที่ ๑๙ / ระหว่างเวลา น. ถึง น. … ตุลาคม ๒๕๖๙ ๐๙.๐๐ ๑๒.๐๐".
- **A text layer can be garbage.** One TOR (69109097103) was typed in an old
  non-Unicode Thai font: "{rt ruxruifl 'r:fr…". It has to be OCR'd like a scan.

### A draft's zip

The drafts held only the announcement, the bidding document and the TOR, each
marked **ร่าง**:
- ราคากลาง is already in the announcement.
- The bid date is left blank.

**No draft document states its comment deadline.** We checked 6 drafts, 31
files, and OCR'd the scanned TORs. Only e-GP's website shows the comment
period, and that's behind Turnstile. For an e-GP draft, `facts.commentDeadline`
will almost always be empty, and the page says the TOR doesn't state it
([0019](../decisions/0019-stage-badges-and-deadlines-that-say-what-for.md)).

### Price zip

`pB0.pdf`, one scanned page:
- **Budget** (วงเงินงบประมาณที่ได้รับจัดสรร)
- **ราคากลาง**, and the date it was set
- Where the price came from, and who set it

We saw two forms. The title of บก.06 is "ตารางแสดงวงเงินงบประมาณที่ได้รับจัดสรรและ
ราคากลาง (ราคาอ้างอิง) ในการจัดซื้อจัดจ้างที่มิใช่งานก่อสร้าง". **แบบ บก.05** is for
hiring software development, and splits the price into hardware, software,
development and other costs. Amounts are written in digits and words; OCR
misreads Thai digits, but the words survive.

### Winner and cancellation pages

These are HTML pages on `process.gprocurement.go.th`, linked from `W0`, `W1`,
`W2` and `D1` feed items ([process3_gprocurement.md](process3_gprocurement.md)).
A winner page states the winner, the winning price including VAT, and the date:
"ผู้ได้รับการคัดเลือก ได้แก่ … โดยเสนอราคา เป็นเงินทั้งสิ้น ๕๔๐,๐๐๐.๐๐ บาท".

## The firewall

process5 sits behind an F5 firewall. On 2026-10-11 we sent one request with
each User-Agent:

| User-Agent | Result |
|---|---|
| curl's default (`curl/8.10.1`) | Answered; the download worked too |
| `axios/1.12.2` | Answered |
| `GIPDP/0.1 (Kasetsart University student project; +https://github.com/PapuBallkub)` | Answered |
| `Mozilla/5.0` alone | **Rejected**: "Request Rejected … Your support ID is: …" with status `200` |

**An honest User-Agent works.** The firewall rejects a fake-looking browser
string, not tools that say what they are, so we don't need to imitate a
browser. Our code still sends a Chrome User-Agent with `Referer` and `Origin`
headers (`tor-downloader.js`, `process3.js`); switching to an honest one is a
pipeline task. Every request goes through the request pacer: at most one a
second per site ([0016](../decisions/0016-pipeline-runs-are-safe-to-repeat.md)).

## When it answers

process5 answered every time we called it:
- Thu 2026-10-08, 03:13–09:48: 18 downloads at 03:25 alone
- Sun 2026-10-11, 12:15–14:35

Answers took 0.1–1.1 s on Sunday. We have never seen a maintenance window or
an error page.

## How the pipeline uses it now

Code, as of 2026-10-11:
1. Ask for the announcement package. If there isn't one, take the price
   package.
2. Download the zip and keep **one** PDF, chosen by file name: `tor` scores
   100, `annou` 80, `bidding` 70, `doc_` 60, `pb0` 50, anything else 10.
   Save it as `server/data/documents/<projectId>_TOR.pdf`. Files over 50 MB
   are refused.
3. Read the announcement's text as "companion text". It feeds only the rough
   hints in `parseTorDocument` (such as "Server / Data Center") and is not
   stored.

**Known gaps** follow from the map above:
- **The wrong file can win.** A TOR named `PPC.29092569.pdf` scores below the
  announcement, so the 2-page announcement would be kept as "the TOR".
- **Garbage text skips OCR.** `ocr.js` treats any PDF with 50 characters of
  text as digital, so a garbled text layer goes straight to the AI.
- **The announcement and the bidding document are thrown away,** although they
  hold the bid date, ราคากลาง and eligibility in clean text.
- **The price form is fetched only as a fallback,** so the budget comes from
  OCR of the TOR when it's there at all.

## Corrections to the previous version of this page

The version merged in #204 said several things that turned out to be wrong:
- **Firewall:** curl and axios are **not** blocked, and imitating a browser is
  not needed. The firewall section is no longer about getting past it.
- **Announcement package:** it doesn't hold "B0, D0 and D1 (amendment)"
  packages; `D1` is a cancellation.
- **Companion text:** the pipeline doesn't keep the announcement's text for
  search. It reads it for hints and drops it.
- **Hours:** we saw no daily 00:00–04:00 maintenance; downloads at 03:13–03:37
  worked. The weekend maintenance and the speed figures were never measured.
- **Package listing:** `bidding noltice.pdf` doesn't summarise the hearing or
  bid dates; it is a general instruction sheet, the same in every package.
  `action_plan.xlsx` is a generic construction template.

## Not verified yet

- What an amended (`D2`) project's package and `infoProcureDocAnnounZipAdj`
  return.
- The parameters `get-procure-announ-history-doc` needs.
- Whether the price package can have several versions (`seqNo` was 2 for one
  project).
- Construction projects' packages. We only checked goods and services.
