# process3: the e-GP RSS feed

The feed is the only source of **open** projects: drafts out for comment and
invitations to bid ([0017](../decisions/0017-read-the-egp-feed-as-egp-defines-it.md)).
This page says what the feed does and how we know it. How the pipeline runs is
in [pipeline.md](../pipeline.md). The documents behind each item are in
[process5_gprocurement.md](process5_gprocurement.md).

**Last checked 2026-10-11.** Each fact names its source:

- **Manual:** CGD's RSS manual, *คู่มือการเชื่อมโยงประกาศจัดซื้อจัดจ้างจากระบบ e-GP
  ไปยังเว็บไซต์หน่วยงานของรัฐในรูปแบบ RSS* (กลุ่มงานพัฒนาระบบจัดซื้อจัดจ้างภาครัฐ,
  กรมบัญชีกลาง, 9 pages). We read a copy at
  `http://www.stock.rbru.ac.th/doc-download/manualRSS.pdf`. The manual says the
  official copy is on www.gprocurement.go.th under ดาวน์โหลดแนะนำ/คู่มือ/รหัสต่าง ๆ.
- **Seen:** observed in feed responses or in our pipeline's logs, with the date.
- **Code:** what our code does, in `server/src/pipeline/ingestion/sources/process3.js`.

## The request

```
https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?anounceType=D0
```

| Fact | Source |
|---|---|
| The manual gives the URL with `http://`. We use `https://`. | Manual, code |
| `process3` answers `302` and redirects to the same path on `https://process.gprocurement.go.th`. Our HTTP client follows it. | Seen 2026-10-11 |
| No account, key or captcha is needed. | Seen |
| The feed answers the pipeline's own User-Agent, which names the project (`pipeline/shared/user-agent.js`). No browser disguise is needed. | Seen 2026-10-13 |

### Parameters

| Parameter | Value | Source |
|---|---|---|
| `anounceType` | Announcement code, see below. **Spelled with one "n".** `announceType` is ignored and the feed returns 0 items with no error. | Manual; seen 2026-10-07 |
| `deptId` | Agency code: `0304` กรมบัญชีกลาง, `0307` กรมสรรพากร. The manual says 4 digits; the feed also takes other formats (below). | Manual; seen 2026-10-13 |
| `deptsubId` | Purchasing unit, **10 digits**: `0300400070` สำนักงานคลังจังหวัดเชียงใหม่ | Manual |
| `methodId` | Procurement method, 2 digits: `02` สอบราคา, `15` e-market, `16` e-bidding, `18` คัดเลือก, `19` เฉพาะเจาะจง, `20`–`22` จ้างที่ปรึกษา, `23`–`26` จ้างออกแบบหรือควบคุมงานก่อสร้าง | Manual |
| `announceDate` | One day, `YYYYMMDD`, Gregorian: `20241126`. The feed then returns that day's announcements only, with no earlier days filled in (manual 4.6). It reaches back at least to 2024-11-26. | Manual; seen 2026-10-14 |

- Combine parameters with `&`.
- **Every response says how many that day really has:** `<countbyday>` in
  the channel (manual 4.7), while the list still shows 20 at most. Without
  `announceDate` it's the latest day's count.
- With no `anounceType`, the feed returns invitations (`D0`).
- **`deptId` filters by agency (seen 2026-10-13).** `anounceType=D0&deptId=0307`
  returned 4 กรมสรรพากร invitations, and `deptId=0304` returned 2 different
  projects. Use it with `npm run ingest:fetch -- --dept 0307`.
- **The agency codes are on data.go.th:** e-GP's list of purchasing units,
  dataset `egpdepartment` (64,134 units, published by THAILAND GOVERNMENT
  SPENDING). `npm run agencies:fetch` keeps central government's, about 270
  ([0027](../decisions/0027-run-the-pipeline-on-a-schedule.md)).
- **Code formats, seen 2026-10-13** (`W0`):

  | Code | Example | Items |
  |---|---|---|
  | 4 digits | `0307` กรมสรรพากร | 11 |
  | 5 digits | `11012` สถาบันข้อมูลขนาดใหญ่ | 1 |
  | Letter and digits | `A004` สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน | 20 |
  | 7 digits | `2810101`, a provincial administration | 3 |
  | 2 digits, a ministry | `03` กระทรวงการคลัง | 0: no asking a ministry at once |
  | 12 digits, an office | `030405500000` สำนักงานคลังจังหวัดเชียงใหม่ | 0 |
  | State enterprise | `S702` | 0, not conclusive |
  | Unknown | `9999` | 0, with no error |

- We have not yet tested `deptsubId` or `methodId` live.

### Announcement codes

These are the manual's codes. Our status engine reads them as in
[0017](../decisions/0017-read-the-egp-feed-as-egp-defines-it.md).

| Code | e-GP's name | Status we derive | What the item links to (seen 2026-10-07) |
|---|---|---|---|
| `P0` | แผนการจัดซื้อจัดจ้าง | not fetched | An HTML page; the ID is a plan ID such as `P69100030274`, not a project ID |
| `15` | ประกาศราคากลาง | none (information) | Never seen: every request for `15` has timed out |
| `B0` | ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา | Draft | **The draft's document zip** (`process5/egp-upload-service/v1/downloadFileTest`). Sometimes empty. |
| `D0` | ประกาศเชิญชวน | Open | **The invitation announcement as a PDF** (`process5/egp-template-service/dwnt/view-pdf-file?templateId=`) |
| `D1` | ยกเลิกประกาศเชิญชวน | Cancelled | An HTML page |
| `D2` | เปลี่ยนแปลงประกาศเชิญชวน | Open + Amended | Not seen: `D2` returned 0 items |
| `W0` | ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก | Awarded | An HTML page with the winner and the price |
| `W1` | ยกเลิกประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก | Cancelled | An HTML page |
| `W2` | เปลี่ยนแปลงประกาศรายชื่อผู้ชนะการเสนอราคา | Awarded | An HTML page |

**Watch the letters.**
- `D1` is a **cancellation** and `D2` a **change**.
- `W0` is the **winner**, not a cancellation.

The HTML pages live at
`https://process.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?servlet=gojsp&proc_id=ShowHTMLFile&…`.
They are encoded in TIS-620 and answer even when the feed doesn't (seen
2026-10-11). The feed gives them with `http://`, which redirects to `https://`.

## The response

RSS 2.0. Each `<item>` looks like this (seen 2026-10-07):

```xml
<item>
  <title>ประกวดราคาซื้อสิทธิการใช้งานระบบบัญชีผู้ใช้งาน Active Directory (Cal AD) ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)</title>
  <link>https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=91440371862845cc9281dc637dd73296</link>
  <description>69109028093, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา</description>
  <pubDate>2026-10-07</pubDate>
  <guid></guid>
</item>
```

- **`description`** is `projectId, method, announcement name`. The project ID
  is 11 digits. Code: `parseItemDescription`.
- **`pubDate`** is a date with no time, not the RFC 822 format RSS usually uses.
- **`guid`** is empty.
- **Encoding:** the XML declares `encoding="Windows-874"`, and the bytes are
  Windows-874. Code: `decodeThaiXml` tries strict UTF-8 first and falls back to
  Windows-874.
- **No budget or price.** The item carries neither; they are in the documents
  ([process5_gprocurement.md](process5_gprocurement.md)).

### How many items

- **Manual:** the latest 20 items of the latest day with announcements. If that
  day has fewer than 20, the feed adds up to 7 days back until it has 20. To
  keep history, a site has to store what it receives.
- **Seen 2026-10-07:** `P0`, `B0`, `D0`, `D1`, `W0` and `W1` each returned 20
  items, all dated that day. `W2` returned 3 and `D2` 0, also all from that
  day.
- **The national feed doesn't backfill.** On 2026-10-07 it showed only that
  day's latest 20 per type. On Tue 2026-10-13 at 17:01 (a public holiday) it
  returned **0 items** for `P0`, `B0`, `D0` and `W0`.
- **Per-agency lists do backfill (seen 2026-10-13).** The same evening,
  `deptId=0307` returned 4 `D0` items and 11 `W0` items dated 2026-10-06 to
  2026-10-09.
- **An agency's list holds at most 20 items per code.** `deptId=A004` returned
  exactly 20 `W0` items, dated 2026-10-06 to 2026-10-12. 28 of 267 agencies
  came back with a full list in the first sweep (2026-10-14).
- **How much the national list misses (`countbyday`, seen 2026-10-14):**

  | List | Announced that day | Shown |
  |---|---|---|
  | National invitations, 2026-10-07 | 377 | 20 |
  | National invitations, 2026-10-09 | 490 | 20 |
  | สพฐ (`A004`) winners, 2026-10-12 | 5 | 5 |
  | กรมสรรพากร (`0307`) invitations, 2026-10-09 | 1 | 1 |
  | กรมบัญชีกลาง (`0304`) winners, 2024-11-26 | 8 | 8 |
  | กรมสรรพากร (`0307`) winners, 2025-03-14 | 13 | 13 |

- So the national list shows 4–5% of a busy day, and is empty on a quiet
  one. One agency on one day was complete every time, and `countbyday` says
  when it isn't. The sweep asks each agency's list, and asks a full list
  again day by day ([0027](../decisions/0027-run-the-pipeline-on-a-schedule.md)).

## How fast we may ask

**e-GP refuses the 240th request in a row, whatever the pace.** It answers
**HTTP 429 Too Many Requests** from then on, until we stop for a while.

| Sweep | Pace | What happened |
|---|---|---|
| 2026-10-13, 23:12 | One a second | Refused after about 250 requests, 4 minutes in |
| 2026-10-14, 00:06 | One every 3 seconds | Refused 7 times, each time after exactly 240 requests (238, then 2 more), 12 minutes in. After each 10-minute pause, another 240 were answered. |

So it's a count that resets after a quiet spell of 10 minutes or less, not
a rate: slowing down only made the sweep take longer. We didn't capture the
429 response's headers, so whether it says how long to wait (`Retry-After`)
is unknown.

The sweep therefore asks at one a second and pauses 10 minutes after every
230 requests, before the limit; a 429 still makes it pause and ask again
([0027](../decisions/0027-run-the-pipeline-on-a-schedule.md)). The national
poll, 7 requests, is well under the limit. Downloads from e-GP's document
server (`process5`), about 4 requests a project, haven't been refused yet.

## When it answers

**Manual:** the feed is **open 17:01–08:29 only** (4.8, in
[the edition with 2024 examples](https://www.gprocurement.go.th/wps/wcm/connect/a29d7750-c6b6-4428-b9a4-6c8224626073/Rss+%2822-05-61%29.pdf?MOD=AJPERES)).
An older edition gave closed hours of 09:00–12:00 and 13:00–17:00, with a
lunch-hour opening; the feed never answered then.

| Closed | Open |
|---|---|
| 08:30–17:00 | 17:01–08:29 |

A closed feed doesn't return an empty list. **The connection hangs until the
client times out.** Code: `isFeedClosed()` sends nothing during closed hours,
and `pipeline.md` tells you when to run.

What we've seen:

| When (Bangkok) | Result |
|---|---|
| Wed 2026-10-07, 13:43 | No answer (closed hours, as documented) |
| Wed 2026-10-07, 19:07–19:09 | Answered: `P0`, `B0`, `D0`, `D1`, `D2`, `W0`, `W1`, `W2` |
| Thu 2026-10-08, 03:13–07:25 (7 runs) | Answered every time |
| Thu 2026-10-08, 08:36 | **No answer** (five 20 s timeouts): after the 08:29 closing |
| Sun 2026-10-11, about 12:20 and 14:33 | **No answer**: closed |
| Tue 2026-10-13 (public holiday), 17:01–17:02 | Answered in 0.1–8 s |
| Tue–Wed 2026-10-13/14, 22:00–08:06 | Answered through the night, apart from the 429s above |
| Wed 2026-10-14, 12:05 | **No answer** (20 s timeouts): closed, as the new edition says |
| Every run so far | `anounceType=15` timed out |

Every observation fits 17:01–08:29. We don't know yet whether weekends
follow it.

## Corrections to the previous version of this page

The version merged in #204 said several things that turned out to be wrong:
- **Codes:** `D1` is not an amendment, `D2` is not a winner, and `W0` is not a
  cancellation (see the table above). `B1`, `D3`, `C0` and `A0` are not in the
  manual and haven't been tested.
- **`deptId`** has 4 digits, not 5.
- **Hours:** office hours are when the feed is *closed*, not the time to query
  it. When closed, it hangs instead of returning an empty feed.
- **Encoding:** the XML declares Windows-874, not UTF-8.
- **Item format:** the description holds no budget, and `pubDate` has no time.
- **No fallback:** the pipeline doesn't switch to data.go.th when the feed is
  empty. `--source all` queries both, and `--source process3` queries only the
  feed ([pipeline.md](../pipeline.md)).

## Not verified yet

- `deptsubId` and `methodId` filtering, live: the way to split an agency's
  day that has more than 20.
- Whether state enterprise codes (`S…`) and special-law agency codes work.
- The feed's hours at weekends.
- How far back `announceDate` reaches: 2024-11-26 worked.
- How short a pause resets the 240-request count: 10 minutes is enough.
- How far back a quiet agency's list reaches: 7 days, as the manual says?
- What a `D2` item links to.
- Whether `15` ever answers.
