import { escapeAndDefang } from './match-digest.template.js';

/**
 * Formats a currency amount in Thai Baht (e.g. ฿3,200,000).
 */
function formatTHB(amount) {
  if (amount === null || amount === undefined) return 'ไม่ระบุในเอกสาร';
  return `฿${Number(amount).toLocaleString('th-TH')}`;
}

/**
 * Formats a Date object into a readable Thai date string (e.g. 15 พ.ย. 2569).
 */
function formatThaiDate(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Renders a modular HTML card for a single watchlist alert item
 * (amendment, status_change, or deadline).
 */
function renderAlertCard(item, appUrl) {
  const safeTitle = escapeAndDefang(item.projectTitle || item.title || 'โครงการจัดซื้อจัดจ้าง');
  const safeAgency = escapeAndDefang(item.agency || 'หน่วยงานภาครัฐ');
  const budgetText = formatTHB(item.budget);
  const safeProjectId = escapeAndDefang(item.projectId || item.id || '');
  const torUrl = `${appUrl}/tor/${encodeURIComponent(item.projectId || item.id || '')}`;

  if (item.type === 'amendment') {
    const versionText = item.amendedVersion ? `เวอร์ชัน ${item.amendedVersion}` : 'ฉบับแก้ไข';
    const fields = (item.changedFieldsTh || item.changedFields || []).map(escapeAndDefang);
    const fieldsHtml = fields
      .map(
        (f) =>
          `<span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:2px 8px;border-radius:3px;font-size:12px;margin:2px 4px 2px 0;">${f}</span>`
      )
      .join('');

    return `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid #f59e0b;border-radius:8px;padding:18px;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td>
              <span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:12px;font-weight:bold;padding:2px 8px;border-radius:4px;">
                แก้ไขเอกสาร TOR (${versionText})
              </span>
            </td>
            <td style="text-align:right;font-size:12px;color:#64748b;font-family:monospace;">
              ID: ${safeProjectId}
            </td>
          </tr>
        </table>
        
        <h3 class="no-autolink" style="margin:10px 0 4px 0;font-size:16px;line-height:1.4;color:#0f172a;">
          <span style="color:#0f172a !important;text-decoration:none !important;">${safeTitle}</span>
        </h3>
        
        <p style="margin:0 0 12px 0;font-size:13px;color:#475569;">
          ${safeAgency}
        </p>

        <div style="font-size:13px;color:#334155;margin-bottom:10px;">
          <strong>งบประมาณ:</strong> ${budgetText}
        </div>

        ${
          fields.length > 0
            ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px;">หัวข้อที่มีการปรับแก้:</div>
          <div>${fieldsHtml}</div>
        </div>
        `
            : ''
        }

        <div>
          <a href="${torUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:13px;font-weight:500;">
            ดูประวัติการแก้ไขและเปรียบเทียบ TOR &rarr;
          </a>
        </div>
      </div>
    `;
  }

  if (item.type === 'status_change') {
    const prevTh = escapeAndDefang(item.previousStatusTh || item.previousStatus || 'ก่อนหน้า');
    const newTh = escapeAndDefang(item.newStatusTh || item.newStatus || 'ปัจจุบัน');

    return `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid #3b82f6;border-radius:8px;padding:18px;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td>
              <span style="display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-size:12px;font-weight:bold;padding:2px 8px;border-radius:4px;">
                สถานะโครงการเปลี่ยนแปลง
              </span>
            </td>
            <td style="text-align:right;font-size:12px;color:#64748b;font-family:monospace;">
              ID: ${safeProjectId}
            </td>
          </tr>
        </table>
        
        <h3 class="no-autolink" style="margin:10px 0 4px 0;font-size:16px;line-height:1.4;color:#0f172a;">
          <span style="color:#0f172a !important;text-decoration:none !important;">${safeTitle}</span>
        </h3>
        
        <p style="margin:0 0 12px 0;font-size:13px;color:#475569;">
          ${safeAgency}
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:13px;">
          <span style="color:#64748b;">สถานะเดิม:</span> <strong>${prevTh}</strong>
          &nbsp;&rarr;&nbsp;
          <span style="color:#1d4ed8;">สถานะใหม่:</span> <strong style="color:#1d4ed8;">${newTh}</strong>
        </div>

        <div style="font-size:13px;color:#334155;margin-bottom:14px;">
          <strong>งบประมาณ:</strong> ${budgetText}
        </div>

        <div>
          <a href="${torUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:13px;font-weight:500;">
            เปิดดูรายละเอียดโครงการ &rarr;
          </a>
        </div>
      </div>
    `;
  }

  // Type: deadline (or fallback)
  const days = item.daysRemaining ?? 0;
  const deadlineDateText = formatThaiDate(item.deadlineDate);

  return `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid #f97316;border-radius:8px;padding:18px;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td>
            <span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;font-size:12px;font-weight:bold;padding:2px 8px;border-radius:4px;">
              ใกล้สิ้นสุดกำหนดยื่นข้อเสนอ (เหลืออีก ${days} วัน)
            </span>
          </td>
          <td style="text-align:right;font-size:12px;color:#64748b;font-family:monospace;">
            ID: ${safeProjectId}
          </td>
        </tr>
      </table>
      
      <h3 class="no-autolink" style="margin:10px 0 4px 0;font-size:16px;line-height:1.4;color:#0f172a;">
        <span style="color:#0f172a !important;text-decoration:none !important;">${safeTitle}</span>
      </h3>
      
      <p style="margin:0 0 12px 0;font-size:13px;color:#475569;">
        ${safeAgency}
      </p>

      <div style="font-size:13px;color:#334155;margin-bottom:14px;">
        <strong>งบประมาณ:</strong> ${budgetText}
        ${deadlineDateText ? `&nbsp;·&nbsp;<strong>กำหนดปิดรับซอง:</strong> <span style="color:#c2410c;font-weight:bold;">${deadlineDateText}</span>` : ''}
      </div>

      <div>
        <a href="${torUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:13px;font-weight:500;">
          เปิดดูเอกสารและรายละเอียด &rarr;
        </a>
      </div>
    </div>
  `;
}

/**
 * Formats a plain-text representation of a single watchlist alert item.
 */
function renderAlertText(item, idx, appUrl) {
  const safeTitle = item.projectTitle || item.title || 'โครงการจัดซื้อจัดจ้าง';
  const safeAgency = item.agency || 'หน่วยงานภาครัฐ';
  const budgetText = formatTHB(item.budget);
  const torUrl = `${appUrl}/tor/${encodeURIComponent(item.projectId || item.id || '')}`;

  if (item.type === 'amendment') {
    const versionText = item.amendedVersion ? `เวอร์ชัน ${item.amendedVersion}` : 'ฉบับแก้ไข';
    const fields = (item.changedFieldsTh || item.changedFields || []).join(', ');
    return `${idx + 1}. [แก้ไขเอกสาร TOR - ${versionText}] ${safeTitle}\n   หน่วยงาน: ${safeAgency}\n   งบประมาณ: ${budgetText}\n   หัวข้อที่แก้ไข: ${fields || 'ไม่ระบุ'}\n   เปิดดู: ${torUrl}`;
  }

  if (item.type === 'status_change') {
    const prevTh = item.previousStatusTh || item.previousStatus || 'ก่อนหน้า';
    const newTh = item.newStatusTh || item.newStatus || 'ปัจจุบัน';
    return `${idx + 1}. [เปลี่ยนสถานะ: ${prevTh} -> ${newTh}] ${safeTitle}\n   หน่วยงาน: ${safeAgency}\n   งบประมาณ: ${budgetText}\n   เปิดดู: ${torUrl}`;
  }

  const days = item.daysRemaining ?? 0;
  const deadlineDateText = formatThaiDate(item.deadlineDate);
  return `${idx + 1}. [ใกล้ปิดรับข้อเสนอ - เหลืออีก ${days} วัน] ${safeTitle}\n   หน่วยงาน: ${safeAgency}\n   งบประมาณ: ${budgetText}${deadlineDateText ? ` · กำหนดปิดรับ: ${deadlineDateText}` : ''}\n   เปิดดู: ${torUrl}`;
}

/**
 * Renders the email subject line and HTML body for a watchlist updates digest.
 *
 * @param {Object} options
 * @param {string} options.recipientName - Name or email username of recipient
 * @param {Array} options.alerts - Watchlist alert snapshot items
 * @param {string} options.unsubscribeUrl - 1-click PDPA unsubscribe URL
 * @param {string} options.appUrl - Base web app URL (e.g. https://gipdp.go.th)
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderWatchlistDigestEmail({
  recipientName = 'ผู้ประกอบการ',
  alerts = [],
  unsubscribeUrl = '#',
  appUrl = 'http://localhost:3000',
}) {
  const count = alerts.length;
  const subject = `[GIPDP] สรุปอัปเดต ${count} โครงการที่คุณติดตามใน Watchlist`;
  const safeRecipientName = escapeAndDefang(recipientName);

  const itemCardsHtml = alerts.map((it) => renderAlertCard(it, appUrl)).join('');
  const textCards = alerts.map((it, idx) => renderAlertText(it, idx, appUrl)).join('\n\n');

  const html = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <title>${subject}</title>
  <style>
    /* Prevent email clients from autolinking unrecognized text in titles */
    a[x-apple-data-detectors],
    .no-autolink a,
    h3 a {
      color: #0f172a !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
      pointer-events: none !important;
      cursor: default !important;
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Thai',sans-serif;color:#0f172a;line-height:1.5;">
  <div style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background:#0f172a;padding:24px 28px;color:#ffffff;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;">
        GIPDP · Government IT Procurement Discovery Platform
      </div>
      <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:700;color:#ffffff;">
        รายงานอัปเดตโครงการที่คุณติดตาม
      </h1>
    </div>

    <!-- Body Content -->
    <div style="padding:28px;">
      <p style="margin:0 0 16px 0;font-size:15px;color:#1e293b;">
        สวัสดีคุณ <strong>${safeRecipientName}</strong>,
      </p>
      
      <p style="margin:0 0 20px 0;font-size:14px;color:#334155;line-height:1.6;">
        ระบบ GIPDP ตรวจพบความคืบหน้าและการเปลี่ยนแปลงในโครงการจัดซื้อจัดจ้างที่คุณบันทึกติดตามไว้ (Watchlist) จำนวน <strong>${count} รายการ</strong>:
      </p>

      <!-- Alert Cards List -->
      ${itemCardsHtml}

      <div style="text-align:center;margin:28px 0 12px 0;">
        <a href="${appUrl}/notifications" style="display:inline-block;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
          ดูรายการแจ้งเตือนทั้งหมดในระบบเว็บ &rarr;
        </a>
      </div>
    </div>

    <!-- Footer & PDPA Notice -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 28px;font-size:12px;color:#64748b;line-height:1.6;">
      <p style="margin:0 0 8px 0;">
        <strong>ข้อความปฏิเสธความรับผิดชอบ (Disclaimer):</strong> GIPDP เป็นเครื่องมืออิสระสำหรับค้นหาและวิเคราะห์ TOR เพื่อช่วยผู้ประกอบการและนักพัฒนาเทคโนโลยี ไม่ใช่ระบบยื่นข้อเสนอของทางราชการ การยื่นซองข้อเสนอและการประมูลอย่างเป็นทางการต้องกระทำผ่านระบบ e-GP เท่านั้น
      </p>
      <p style="margin:0 0 12px 0;">
        อีเมลฉบับนี้ส่งถึงคุณโดยอัตโนมัติตามการตั้งค่าในระบบที่คุณเปิดรับไว้ (PDPA Opt-in)
      </p>
      <div style="border-top:1px dashed #cbd5e1;padding-top:10px;text-align:center;">
        <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">
          ยกเลิกการรับอีเมลแจ้งเตือนทั้งหมด (One-Click Unsubscribe)
        </a>
      </div>
    </div>

  </div>
</body>
</html>
  `.trim();

  const text = `
GIPDP · Government IT Procurement Discovery Platform
รายงานอัปเดตโครงการที่คุณติดตาม

สวัสดีคุณ ${recipientName},

ระบบ GIPDP ตรวจพบความคืบหน้าและการเปลี่ยนแปลงในโครงการที่คุณบันทึกติดตามไว้ (Watchlist) จำนวน ${count} รายการ:

${textCards}

ดูรายการแจ้งเตือนทั้งหมดในระบบเว็บ: ${appUrl}/notifications

---
ข้อความปฏิเสธความรับผิดชอบ (Disclaimer): GIPDP เป็นเครื่องมืออิสระสำหรับค้นหาและวิเคราะห์ TOR เพื่อช่วยผู้ประกอบการและนักพัฒนาเทคโนโลยี ไม่ใช่ระบบยื่นข้อเสนอของทางราชการ การยื่นซองข้อเสนอและการประมูลอย่างเป็นทางการต้องกระทำผ่านระบบ e-GP เท่านั้น

ยกเลิกการรับอีเมลแจ้งเตือน: ${unsubscribeUrl}
  `.trim();

  return { subject, html, text };
}
