# data.go.th — Open Government Data Portal Reference

This document provides a comprehensive technical guide to **`data.go.th`**, Thailand's official Open Government Data portal operated by the Digital Government Development Agency (DGA). It covers architecture, CKAN REST APIs, datasets, schemas, and query strategies for procurement data extraction.

---

## 1. System Overview

- **Host**: `https://data.go.th`
- **Owner**: Digital Government Development Agency (DGA) / สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน) (สพร.)
- **Underlying Technology**: CKAN (Comprehensive Knowledge Archive Network) v2.9+
- **Data Access Layer**: CKAN Datastore Extension (PostgreSQL backing store)
- **Authentication**: None required for public reading (open machine-readable data)
- **Role in Pipeline**: **Discovery & Cataloging** — Provides historical and ongoing government procurement metadata, project IDs, budgets, and agency information.

---

## 2. Architecture & API Endpoints

The CKAN Action API exposes machine-readable endpoints under `/api/3/action/`:

| Endpoint | HTTP Method | Description |
| :--- | :---: | :--- |
| `https://data.go.th/api/3/action/datastore_search` | `GET` / `POST` | Executes queries, filters, and full-text searches against tabular datasets |
| `https://data.go.th/api/3/action/package_show` | `GET` | Fetches package metadata and all associated resource IDs |
| `https://data.go.th/api/3/action/resource_show` | `GET` | Inspects individual resource schema, row counts, and update timestamps |

---

## 3. Procurement Datasets & Resources

The Comptroller General's Department (CGD) publishes annual electronic government procurement records to `data.go.th`.

### Primary Dataset: `egp-contact-2568` (Fiscal Year 2025 / 2568)
Each fiscal year is partitioned into 10 chunked CSV/Datastore resources to handle hundreds of thousands of public procurement transactions:

| Resource Index | Resource ID (`resource_id`) | Format | Coverage |
| :---: | :--- | :---: | :--- |
| **Part 1** | `e4eaa1b4-eb1a-4534-b227-988ee25b898d` | Datastore / CSV | Primary active batch (Q1-Q2 FY2568) |
| **Part 2** | `9ae119c4-73b9-4bb6-9b71-7b355269bc00` | Datastore / CSV | Batch 2 |
| **Part 3** | `1c1a90af-2d47-4bfb-ae87-e479b2582257` | Datastore / CSV | Batch 3 |
| **Part 4** | `c2385bd6-7e2a-40c2-94d8-6a65824c9415` | Datastore / CSV | Batch 4 |
| **Part 5** | `bb538ac1-3455-446d-b975-d709d6439e72` | Datastore / CSV | Batch 5 |
| **Part 6** | `5b98d6ba-0f66-4bb1-b8db-9b9aae928171` | Datastore / CSV | Batch 6 |
| **Part 7** | `037adcca-b349-44f6-9686-9fd1e9182227` | Datastore / CSV | Batch 7 |
| **Part 8** | `26316135-a95f-40e3-b2e8-1c912046c0ed` | Datastore / CSV | Batch 8 |
| **Part 9** | `882332c4-1f60-4db7-9962-9062eb08f6c4` | Datastore / CSV | Batch 9 |
| **Part 10** | `35961821-d945-4fc0-8ce1-a96b4cd46bd6` | Datastore / CSV | Batch 10 |

### Historical Datasets
- **`egp-contact-2567`**: Fiscal Year 2567 / 2024 procurement contracts.
- **`summary_cgdcontract`** (`ef2c6a07-afdf-4b3a-b8d3-223a2bc2ad83`): Ministry-level summary contract aggregations.

---

## 4. Data Dictionary (Schema)

When calling `datastore_search`, each item in `result.records` contains the following fields:

| Field Name | Type | Description | Example Value |
| :--- | :---: | :--- | :--- |
| `_id` | `int` | Internal CKAN datastore row identifier | `719` |
| `ลำดับ` | `int` | Sequential row number | `719` |
| **`รหัสโครงการ`** | `text / int` | **11-Digit e-GP Project ID** *(Primary Join Key)* | `68069160377` |
| `ชื่อโครงการ` | `text` | Official project announcement title | `ประกวดราคาซื้อระบบงานบัญชี การเงิน งบประมาณ พัสดุและบำรุงรักษา (ซอฟต์แวร์ SAP)` |
| `ชื่อประเภทโครงการ` | `text` | Procurement category (`ซื้อ`, `จ้าง`, `เช่า`) | `ซื้อ` |
| `ชื่อหน่วยงาน` | `text` | Parent government agency or ministry | `การทางพิเศษแห่งประเทศไทย` |
| `ชื่อหน่วยงานย่อย` | `text` | Specific department, bureau, or division | `การทางพิเศษแห่งประเทศไทย (กทพ.) กรุงเทพฯ` |
| `วิธีจัดซื้อฯ` | `text` | Legal procurement method clause | `วิธีการจัดหา ประกาศเชิญชวนทั่วไป คัดเลือก เฉพาะเจาะจง` |
| `กลุ่มวิธีจัดซื้อฯ` | `text` | Procurement mechanism category | `ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)` |
| `วันที่ประกาศ` | `text` | Public announcement date | `19 มิ.ย. 68` |
| `งบประมาณ(บาท)` | `numeric` | Total allocated budget (THB) | `317790000` |
| `ราคากลาง(บาท)` | `numeric` | Median / Reference price (THB) | `317683000` |
| `ราคาตกลงซื้อ/จ้าง` | `numeric` | Final winning bid / contract value | `155192800` |
| `ปีงบประมาณ` | `int` | Thai Buddhist Era fiscal year | `2568` |
| `จังหวัด` | `text` | Geographic province of project location | `กรุงเทพมหานคร` |
| `ชื่อผู้ชนะ` | `text` | Contractor / Awarded company | `บริษัท แอดวานซ์ โซลูชั่น แอนด์ เทคโนโลยี่ จำกัด` |
| `เลขนิติบุคคล` | `text` | 13-digit Tax ID of awarded contractor | `0105549007974` |
| `เลขที่สัญญา` | `text` | Official contract number | `กจด.ป.๑๑๕/๒๕๖๘` |

---

## 5. API Usage & Code Examples

### A. cURL Example (Full-text Keyword Query)
```bash
curl -X GET "https://data.go.th/api/3/action/datastore_search?resource_id=e4eaa1b4-eb1a-4534-b227-988ee25b898d&limit=5&q=%E0%B8%8B%E0%B8%AD%E0%B8%9F%E0%B8%95%E0%B9%8C%E0%B9%81%E0%B8%A7%E0%B8%A3%E0%B9%8C" \
  -H "User-Agent: Mozilla/5.0"
```

### B. JavaScript (Axios) Implementation
```javascript
import axios from 'axios';

async function searchSoftwareProjects(keyword = 'ซอฟต์แวร์', limit = 10) {
  const resourceId = 'e4eaa1b4-eb1a-4534-b227-988ee25b898d';
  const url = `https://data.go.th/api/3/action/datastore_search`;

  const response = await axios.get(url, {
    params: {
      resource_id: resourceId,
      q: keyword,
      limit,
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
    timeout: 30000,
  });

  const records = response.data?.result?.records || [];
  return records.map((r) => ({
    projectId: String(r['รหัสโครงการ'] || '').trim(),
    title: r['ชื่อโครงการ'],
    agency: r['ชื่อหน่วยงาน'],
    budget: r['งบประมาณ(บาท)'],
    date: r['วันที่ประกาศ'],
    method: r['กลุ่มวิธีจัดซื้อฯ'],
  }));
}
```

---

## 6. Query Parameters Reference

| Parameter | Type | Required | Description | Example |
| :--- | :---: | :---: | :--- | :--- |
| `resource_id` | `string` | **Yes** | Target resource UUID | `e4eaa1b4-eb1a-4534-b227-988ee25b898d` |
| `q` | `string` | No | Full-text search term across all text columns | `ซอฟต์แวร์` |
| `limit` | `int` | No | Number of records to return (default: 100) | `10` |
| `offset` | `int` | No | Pagination offset index | `0` |
| `filters` | `JSON` | No | Exact column matching dictionary | `{"ชื่อประเภทโครงการ": "ซื้อ"}` |
| `sort` | `string` | No | Sorting criteria (`field asc` or `field desc`) | `งบประมาณ(บาท) desc` |

---

## 7. Strengths & Limitations

### Strengths
- **Public & Unauthenticated**: Accessible without API keys, bearer tokens, or login sessions.
- **Broad Historic Depth**: Contains completed contracts, winner details, and historical data across fiscal years.
- **Full-Text Search Engine**: Built-in PostgreSQL full-text search matches Thai keywords across project titles, agency names, and winner names.
- **High Uptime**: Operates on cloud infrastructure separate from the legacy e-GP frontends.

### Limitations
- **No Document Hosting**: `data.go.th` **never hosts attachments, PDFs, or ZIP archives**. It only stores metadata records.
- **Sync Latency**: Data is updated in periodic bulk batches by CGD; breaking, real-time announcements from this morning appear first on `process3` RSS before syncing to `data.go.th`.
- **Partitioned Resources**: A complete query across an entire fiscal year requires iterating across all 10 resource IDs.

---

## 8. Operating Hours & Availability

- **API Service Availability**: **24 hours a day, 7 days a week, 365 days a year**.
- **Business Hours Restrictions**: **None**. Because `data.go.th` is hosted on modern cloud infrastructure managed by DGA, the REST API does not close at 16:30 ICT or on weekends.
- **Latency & Response Times**: Consistently between `150ms` and `400ms` at all hours.
- **Data Ingestion Schedule**: The underlying procurement datasets are uploaded in scheduled batches (typically weekly or monthly) by CGD officers. While historical queries are always available, real-time announcements posted today will appear on `process3` RSS hours or days before syncing here.

