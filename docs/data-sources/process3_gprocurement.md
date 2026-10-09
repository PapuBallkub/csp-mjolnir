# process3.gprocurement.go.th — e-GP Phase 3 Real-time RSS Feed Reference

This document provides a comprehensive technical guide to **`process3.gprocurement.go.th`**, the official real-time RSS XML announcement feed of Thailand's Electronic Government Procurement (e-GP) system operated by the Comptroller General's Department (CGD).

---

## 1. System Overview

- **Host**: `https://process3.gprocurement.go.th`
- **Owner**: Comptroller General's Department (CGD), Ministry of Finance / กรมบัญชีกลาง กระทรวงการคลัง
- **Underlying Technology**: Java EE Application Server behind F5 BIG-IP Load Balancers
- **Data Access Format**: RSS 2.0 XML
- **Character Encoding**: Thai Windows-874 / TIS-620 (often served with UTF-8 XML declaration headers)
- **Primary Endpoint**: `https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml`
- **Role in Pipeline**: **Real-Time Announcement Stream** — Captures ongoing government procurement announcements as they are posted on business days.

---

## 2. Complete Taxonomy of Announcement Codes (`anounceType`)

The e-GP system categorizes procurement notices using distinct 2-character codes representing each stage of the government procurement lifecycle:

| Stage | Code | Official Thai Designation | English Description | Attachment Available |
| :--- | :---: | :--- | :--- | :---: |
| **1. Planning** | **`P0`** | แผนการจัดซื้อจัดจ้าง | Annual Procurement Plan announcement | Summary Only |
| | **`P1`** | เปลี่ยนแปลงแผนการจัดซื้อจัดจ้าง | Revised Annual Procurement Plan | Summary Only |
| **2. Draft TOR** | **`B0`** | เผยแพร่ร่างประกาศและร่างเอกสารประกวดราคา | **Draft TOR & Draft Tender** (Public comments & hearing) | **Yes** (TOR PDF) |
| | **`B1`** | ปรับปรุงร่างประกาศ | Revised Draft TOR (Hearing period extended) | **Yes** (TOR PDF) |
| **3. Bidding / Tender**| **`D0`** | ประกาศเชิญชวน | **Official Invitation to Bid** (Open for tender) | **Yes** (Full Spec) |
| | **`D1`** | เปลี่ยนแปลงประกาศเชิญชวน | **Amendment to Invitation** (Extension of submission) | **Yes** (Revised Spec) |
| | **`D3`** | ประกาศรายชื่อผู้ผ่านการพิจารณาคุณสมบัติ | Shortlist of Qualified / Eligible Bidders | Summary Notice |
| **4. Awarding** | **`D2`** | ประกาศผู้ชนะการเสนอราคา | **Winning Bidder / Award Notice** | Summary Notice |
| **5. Reference Price** | **`15`** | ตารางแสดงวงเงินงบประมาณและราคากลาง | **Reference Price Sheet** (Median price calculation) | **Yes** (`pB0.pdf`) |
| **6. Cancellation** | **`W0`** | ยกเลิกประกาศเชิญชวน | Cancellation of procurement tender | Notice Only |
| | **`W1`** | เปลี่ยนแปลงประกาศยกเลิก | Revised cancellation notice | Notice Only |
| **7. Contract** | **`C0`** | สาระสำคัญในสัญญา | Contract execution summary notice | Summary Only |
| | **`A0`** | สรุปข้อมูลการจัดซื้อจัดจ้าง | Periodic procurement summary | Summary Only |

---

## 3. Feed Query Parameters

The RSS XML feed is customized using URL search parameters:

```text
https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?anounceType={CODE}&deptId={DEPT_ID}
```

| Parameter | Type | Required | Description | Example |
| :--- | :---: | :---: | :--- | :--- |
| `anounceType` | `string` | No | Announcement stage code (defaults to B0/D0 if omitted) | `B0`, `D0`, `D1`, `15`, `P0`, `W0` |
| `deptId` | `string` | No | 5-digit department code (Ministry / Department) | `02000` (Office of the Permanent Secretary), `30501` (BMA) |

---

## 4. Thai Character Encoding Protocol

One of the most frequent points of failure when interacting with `process3` is character encoding corruption.

### The Problem
The XML declaration header specifies `<?xml version="1.0" encoding="utf-8" ?>`, but the HTTP response body is frequently transmitted in **Windows-874 / TIS-620** byte streams. A naive UTF-8 decoder produces:
- Unicode replacement characters: `\uFFFD` (``)
- Mojibake corruption: `เธ[ก-ฮ]` (e.g. `เธเธฃเธฐเธเธฒเธจ`)

### Robust Decoding Implementation (Node.js)
```javascript
export function decodeThaiXml(buffer) {
  const rawBytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let xmlText = '';
  let usedEncoding = 'utf-8';

  // 1. Attempt strict UTF-8 decoding
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    xmlText = utf8Decoder.decode(rawBytes);
    usedEncoding = 'utf-8';
  } catch {
    // 2. Fallback to Thai Windows-874 on decoding failure
    const win874Decoder = new TextDecoder('windows-874');
    xmlText = win874Decoder.decode(rawBytes);
    usedEncoding = 'windows-874';
  }

  // 3. Verify integrity against Mojibake patterns
  const hasReplacementChar = xmlText.includes('\uFFFD');
  const hasMojibakePattern = /เธ[ก-ฮ]/.test(xmlText);
  const isCorrupted = hasReplacementChar || hasMojibakePattern;

  // 4. Force Windows-874 if UTF-8 resulted in Mojibake
  if (isCorrupted && usedEncoding === 'utf-8') {
    const win874Decoder = new TextDecoder('windows-874');
    xmlText = win874Decoder.decode(rawBytes);
    usedEncoding = 'windows-874 (recovered)';
  }

  return { xmlText, encoding: usedEncoding, isCorrupted };
}
```

---

## 5. XML Schema & Item Structure

The RSS feed produces standard RSS 2.0 XML:

```xml
<?xml version="1.0" encoding="windows-874" ?>
<rss version="2.0">
  <channel>
    <title>ประกาศจัดซื้อจัดจ้างภาครัฐ</title>
    <link>http://process.gprocurement.go.th</link>
    <description>ประกาศจัดซื้อจัดจ้างภาครัฐล่าสุด</description>
    <language>th-TH</language>
    <item>
      <title>ประกวดราคาซื้อครุภัณฑ์คอมพิวเตอร์ สำหรับหน่วยงานส่วนกลาง</title>
      <link>http://process.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=68099123456</link>
      <description>ประกาศประกวดราคาซื้อครุภัณฑ์คอมพิวเตอร์ รหัสโครงการ 68099123456 งบประมาณ 12,500,000 บาท</description>
      <pubDate>Fri, 09 Oct 2026 09:30:00 +0700</pubDate>
    </item>
  </channel>
</rss>
```

### Extracting the 11-Digit Project ID
The project ID is the vital join key to resolve documents from `process5`. It can be extracted using regular expressions:
```javascript
// Check description for 11-digit project ID
const idFromDesc = item.description?.match(/\b(\d{11})\b/)?.[1];

// Or check URL parameter
const idFromLink = item.link?.match(/project_id=(\d{11})/i)?.[1];

const projectId = idFromDesc || idFromLink;
```

---

## 6. Infrastructure Quirks & Operational Behavior

### A. BIG-IP Load Balancer Redirects
Calls to `https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml` frequently return an **HTTP 302 Found** redirecting to `https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml`. Clients must configure `maxRedirects: 5` and handle HTTP 302 gracefully.

### B. Peak Hour Latency & High-Load Timeouts
Between **09:00 and 11:30 AM ICT** (Thai government business hours), government officers actively submit tenders. The RSS server experiences severe connection backlogs:
- Request timeouts must be set to at least **`10,000ms`**.
- Automatic retry with exponential backoff (`delay(1000)`) is essential.

### C. The Daily Sliding Window
`process3` acts as a real-time notification stream:
- It maintains a **sliding window of current daily announcements** (typically 20 to 50 active items per announcement code).
- On weekends, national holidays, or after 18:00 ICT, the feed may return 0 items.
- **Architectural Solution**: When the RSS feed is empty, our pipeline automatically engages the **`data.go.th` catalog fallback** to discover active project IDs without interruption.

---

## 7. Operating Hours, Peak Windows & Off-Hours Schedule

| Time Period | System State | Feed Output | Expected Performance |
| :--- | :--- | :--- | :--- |
| **Mon – Fri: 08:30 – 16:30 ICT** | **Active Publishing Hours** | Active XML feed (20–50 new items per code) | Operational, but subject to peak-hour congestion |
| **09:00 – 11:30 ICT (Morning Peak)** | **Heavy Submission Rush** | Rapidly updating items | **High Timeout Risk**: Latencies spike >10s; frequent BigIP drops |
| **13:30 – 15:30 ICT (Afternoon Peak)** | **Afternoon Publishing Wave** | Active updates | Moderate to high latency (3–8s response time) |
| **Evening Off-Hours: 18:00 – 23:59 ICT** | **Government Off-Hours** | 0 new announcements; older items roll off | Fast responses (~200ms), but feed contains 0 items |
| **Daily Batch Maintenance: 00:00 – 04:00 ICT**| **⚠️ Core Batch Processing** | 0 items; connections may reset or 502/503 | Server performs internal daily consolidation & backups |
| **Early Morning Off-Hours: 04:00 – 08:30 ICT**| **Pre-Office Hours** | Feed resets for the new day | Fast response (~150ms), ready for morning announcements |
| **Weekends (Saturday & Sunday)** | **Closed / Weekend** | **0 items** (`<channel>` without `<item>` tags) | 200 OK returned, but empty payload |
| **National Holidays** | **Closed** | **0 items** | 200 OK returned, but empty payload |
| **Weekend Nights (Sat 22:00 – Sun 06:00)** | **Scheduled Maintenance** | Possible 502/503 Service Unavailable | Maintenance window for e-GP database updates |

### Recommended Fetch Strategy for process3:
- For **live real-time scraping**, query during business hours (**09:00 – 16:30 ICT**) with timeouts configured to at least `10,000ms`.
- Outside business hours, on weekends, or during the **00:00 – 04:00 ICT maintenance window**, use the **`data.go.th` catalog fallback** to avoid returning empty results.


