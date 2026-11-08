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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Renders the email subject line and HTML body for a profile-match digest.
 *
 * @param {Object} options
 * @param {string} options.recipientName - Name or email username of recipient
 * @param {Array} options.matchedItems - Matched tender snapshot receipts
 * @param {string} options.unsubscribeUrl - 1-click PDPA unsubscribe URL
 * @param {string} options.appUrl - Base web app URL (e.g. https://gipdp.go.th)
 * @returns {{ subject: string, html: string }}
 */
export function renderMatchDigestEmail({
  recipientName = 'ผู้ประกอบการ',
  matchedItems = [],
  unsubscribeUrl = '#',
  appUrl = 'http://localhost:3000',
}) {
  const count = matchedItems.length;
  const subject = `[GIPDP] สรุปพบ ${count} โครงการจัดซื้อจัดจ้างภาครัฐที่ตรงกับโปรไฟล์ของคุณ`;

  const itemCardsHtml = matchedItems
    .map((item) => {
      const budgetText = formatTHB(item.budget);
      const deadlineText = formatThaiDate(item.submissionDeadline);
      const skillsHtml = (item.matchedSkills || [])
        .map(
          (s) =>
            `<span style="display:inline-block;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:2px 8px;border-radius:3px;font-size:12px;margin:2px 4px 2px 0;font-family:monospace;">✓ ${s}</span>`,
        )
        .join('');

      return `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td>
              <span style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:12px;font-weight:bold;padding:2px 8px;border-radius:4px;">
                ${item.matchScore}% ตรงกัน
              </span>
            </td>
            <td style="text-align:right;font-size:12px;color:#64748b;font-family:monospace;">
              ID: ${item.projectId}
            </td>
          </tr>
        </table>
        
        <h3 style="margin:10px 0 4px 0;font-size:16px;line-height:1.4;color:#0f172a;">
          ${item.projectTitle}
        </h3>
        
        <p style="margin:0 0 12px 0;font-size:13px;color:#475569;">
          ${item.agency}
        </p>

        <div style="font-size:13px;color:#334155;margin-bottom:10px;">
          <strong>งบประมาณ:</strong> ${budgetText}
          ${deadlineText ? `&nbsp;·&nbsp;<strong>ปิดรับซอง:</strong> ${deadlineText}` : ''}
        </div>

        ${
          skillsHtml
            ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px;">ทักษะที่ตรงกับโปรไฟล์ของคุณ:</div>
          <div>${skillsHtml}</div>
        </div>
        `
            : ''
        }

        <div>
          <a href="${appUrl}/tor/${item.projectId}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:13px;font-weight:500;">
            เปิดดูสรุป TOR ฉบับเต็ม &rarr;
          </a>
        </div>
      </div>
      `;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Thai',sans-serif;color:#0f172a;line-height:1.5;">
  <div style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background:#0f172a;padding:24px 28px;color:#ffffff;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;">
        GIPDP · Government IT Procurement Discovery Platform
      </div>
      <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:700;color:#ffffff;">
        รายงานสรุปโครงการใหม่ที่ตรงกับคุณ
      </h1>
    </div>

    <!-- Body Content -->
    <div style="padding:28px;">
      <p style="margin:0 0 16px 0;font-size:15px;color:#1e293b;">
        สวัสดีคุณ <strong>${recipientName}</strong>,
      </p>
      
      <p style="margin:0 0 20px 0;font-size:14px;color:#334155;line-height:1.6;">
        ระบบ GIPDP ได้ประมวลผลประกาศจัดซื้อจัดจ้างด้าน IT ภาครัฐล่าสุด และตรวจพบ <strong>${count} โครงการ</strong> ที่มีข้อกำหนดทางเทคนิคและงบประมาณสอดคล้องกับโปรไฟล์ความถนัดของคุณ:
      </p>

      <!-- Tender List -->
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
        อีเมลฉบับนี้ส่งถึงคุณโดยอัตโนมัติตามความยินยอมที่คุณให้ไว้ในระบบ (PDPA Opt-in)
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

  return { subject, html };
}
