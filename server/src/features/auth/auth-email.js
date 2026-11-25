import { env, isProduction } from '#common/config/env.js';

// The emails accounts send (0041, 0042). None carries anything a user typed,
// not even their name, so there is nothing to escape: the only variable part
// is a link we built. Thai, plain and short (AGENTS.md §7). Transactional mail,
// so it needs no consent, unlike FR-14's match emails.

const LINK_HOURS = 24;
const RESET_LINK_HOURS = 1;

/** Where the confirm page is. The token goes after `#`, so no server log sees it. */
export const confirmLink = (token) => `${env.corsOrigin}/auth/verify#token=${token}`;

/** Where the reset page is, the token after `#` for the same reason. */
export const resetLink = (token) => `${env.corsOrigin}/auth/reset#token=${token}`;

const p = (text, extra = '') =>
  `<p style="margin:0 0 14px 0;font-size:14px;color:#334155;line-height:1.6;${extra}">${text}</p>`;

const ctaButton = (href, label) =>
  `<div style="margin:20px 0;"><a href="${href}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">${label} &rarr;</a></div>`;

const cautionBox = (text) =>
  `<div style="margin-top:20px;padding:12px 16px;background-color:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:6px;font-size:13px;color:#92400e;line-height:1.6;">&#9888;&#65039; ${text}</div>`;

const wrap = (title, bodyItems) =>
  `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Thai',sans-serif;color:#0f172a;line-height:1.5;">
  <div style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="background:#0f172a;padding:24px 28px;color:#ffffff;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;">
        GIPDP · Government IT Procurement Discovery Platform
      </div>
      <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:700;color:#ffffff;">
        ${title}
      </h1>
    </div>
    <div style="padding:28px;">
      ${bodyItems.join('\n      ')}
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 28px;font-size:12px;color:#64748b;line-height:1.6;">
      <p style="margin:0;">
        <strong>ข้อความปฏิเสธความรับผิดชอบ (Disclaimer):</strong> GIPDP เป็นเครื่องมือค้นหาประกาศจัดซื้อจัดจ้างภาครัฐ ไม่ใช่ระบบของรัฐ การยื่นข้อเสนอทั้งหมดทำบนระบบ e-GP
      </p>
    </div>
  </div>
</body>
</html>`;

/** Someone signed up with this address: the link that creates the account. */
export function confirmEmail(to, token) {
  const link = confirmLink(token);
  const subject = 'ยืนยันอีเมลเพื่อเปิดใช้งานบัญชีของคุณกับระบบ GIPDP';
  return {
    kind: 'confirm',
    to,
    subject,
    text: [
      `มีคนสมัครใช้งานระบบ GIPDP ด้วยอีเมลนี้ ถ้าเป็นคุณ เปิดลิงก์นี้แล้วกรอกรหัสผ่านที่ตั้งไว้ตอนสมัคร: ${link}`,
      `ลิงก์ใช้ได้ครั้งเดียว ภายใน ${LINK_HOURS} ชั่วโมง`,
      'ถ้าไม่ใช่คุณ ไม่ต้องทำอะไร บัญชีจะไม่ถูกสร้างจนกว่าจะยืนยัน',
    ].join('\n\n'),
    html: wrap(subject, [
      p('มีคนสมัครใช้งานระบบ GIPDP ด้วยอีเมลนี้ ถ้าเป็นคุณ กดปุ่มด้านล่างเพื่อเปิดลิงก์ แล้วกรอกรหัสผ่านที่ตั้งไว้ตอนสมัคร', 'font-size:15px;color:#1e293b;'),
      ctaButton(link, 'ยืนยันอีเมล'),
      p(`ลิงก์ใช้ได้ครั้งเดียว ภายใน ${LINK_HOURS} ชั่วโมง`, 'margin-bottom:0;'),
      cautionBox('<strong>ถ้าไม่ใช่คุณ:</strong> ไม่ต้องทำอะไร บัญชีจะไม่ถูกสร้างจนกว่าจะยืนยัน'),
    ]),
  };
}

/** Someone tried to sign up with an address that already has an account. */
export function alreadyRegisteredEmail(to) {
  const signIn = `${env.corsOrigin}/auth`;
  const subject = 'มีคนพยายามสมัครด้วยอีเมลของคุณ';
  return {
    kind: 'already-registered',
    to,
    subject,
    text: [
      'มีคนพยายามสมัครใช้ GIPDP ด้วยอีเมลนี้ แต่อีเมลนี้มีบัญชีอยู่แล้ว',
      `ถ้าเป็นคุณ เข้าสู่ระบบได้เลย (ด้วย Google ถ้าคุณสมัครด้วย Google): ${signIn}`,
      'ถ้าไม่ใช่คุณ ไม่มีอะไรเปลี่ยนแปลง บัญชีของคุณยังเหมือนเดิม',
    ].join('\n\n'),
    html: wrap(subject, [
      p('มีคนพยายามสมัครใช้ GIPDP ด้วยอีเมลนี้ แต่อีเมลนี้มีบัญชีอยู่แล้ว', 'font-size:15px;color:#1e293b;'),
      p('ถ้าเป็นคุณ เข้าสู่ระบบได้เลย (ด้วย Google ถ้าคุณสมัครด้วย Google)'),
      ctaButton(signIn, 'เข้าสู่ระบบ'),
      cautionBox('<strong>ถ้าไม่ใช่คุณ:</strong> ไม่มีอะไรเปลี่ยนแปลง บัญชีของคุณยังเหมือนเดิม'),
    ]),
  };
}

/**
 * A Google account was just linked to an existing account (ASVS V6.3.7). Only
 * a Google account with this exact, verified address can link, so if it wasn't
 * the owner, their Google account is what to secure. The sender is a no-reply
 * address, so the email never says to reply.
 */
export function googleLinkedEmail(to) {
  const subject = 'บัญชี Google เชื่อมกับบัญชีของคุณแล้ว';
  return {
    kind: 'google-linked',
    to,
    subject,
    text: [
      'บัญชี Google ที่ใช้อีเมลนี้เพิ่งถูกเชื่อมกับบัญชี GIPDP ของคุณ จากนี้เข้าสู่ระบบด้วย Google ได้',
      'ถ้าไม่ใช่คุณ แปลว่ามีคนอื่นเข้าถึงบัญชี Google ที่ใช้อีเมลนี้ได้ ให้เปลี่ยนรหัสผ่าน Google และตรวจความปลอดภัยของบัญชีที่ https://myaccount.google.com/security',
    ].join('\n\n'),
    html: wrap(subject, [
      p('บัญชี Google ที่ใช้อีเมลนี้เพิ่งถูกเชื่อมกับบัญชี GIPDP ของคุณ จากนี้เข้าสู่ระบบด้วย Google ได้', 'font-size:15px;color:#1e293b;'),
      cautionBox('<strong>ถ้าไม่ใช่คุณ:</strong> แปลว่ามีคนอื่นเข้าถึงบัญชี Google ที่ใช้อีเมลนี้ได้ ให้เปลี่ยนรหัสผ่าน Google และตรวจความปลอดภัยของบัญชีที่ <a href="https://myaccount.google.com/security" style="color:#92400e;text-decoration:underline;font-weight:600;">myaccount.google.com/security</a>'),
    ]),
  };
}

/**
 * A link to set a new password (ASVS V6.4.3). `kind` is 'set' for an account
 * with no password yet (Google only), so the words fit; `byAdmin` says an admin
 * sent it (V6.4.6), who never saw the link.
 */
export function resetEmail(to, token, { kind = 'reset', byAdmin = false } = {}) {
  const link = resetLink(token);
  const action = kind === 'set' ? 'ตั้งรหัสผ่าน' : 'ตั้งรหัสผ่านใหม่';
  const subject = `${action}สำหรับ GIPDP`;
  const why = byAdmin
    ? `ผู้ดูแลระบบ GIPDP ส่งลิงก์${action}ให้บัญชีที่ใช้อีเมลนี้`
    : `มีคนขอลิงก์${action}สำหรับบัญชี GIPDP ที่ใช้อีเมลนี้`;
  const lines = [
    why,
    `ถ้าคุณต้องการ${action} เปิดลิงก์นี้: ${link}`,
    `ลิงก์ใช้ได้ครั้งเดียว ภายใน ${RESET_LINK_HOURS} ชั่วโมง และเมื่อตั้งแล้ว ทุกอุปกรณ์จะออกจากระบบ`,
    'ถ้าไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้',
  ];
  return {
    kind: byAdmin ? 'admin-reset' : kind,
    to,
    subject,
    text: lines.join('\n\n'),
    html: wrap(subject, [
      p(why, 'font-size:15px;color:#1e293b;'),
      p(`ถ้าคุณต้องการ${action} กดปุ่มด้านล่างเพื่อเปิดลิงก์`),
      ctaButton(link, action),
      p(lines[2], 'margin-bottom:0;'),
      cautionBox(`<strong>ถ้าไม่ได้ขอ:</strong> ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้`),
    ]),
  };
}

/** The password just changed, by the account page or by a reset link (ASVS V6.3.7). */
export function passwordChangedEmail(to) {
  const forgot = `${env.corsOrigin}/auth/forgot`;
  const subject = 'รหัสผ่านของคุณถูกเปลี่ยนแล้ว';
  return {
    kind: 'password-changed',
    to,
    subject,
    text: [
      'รหัสผ่านของบัญชี GIPDP ที่ใช้อีเมลนี้เพิ่งถูกเปลี่ยน และทุกอุปกรณ์ออกจากระบบแล้ว',
      `ถ้าไม่ใช่คุณ ขอลิงก์ตั้งรหัสผ่านใหม่ได้ที่: ${forgot}`,
    ].join('\n\n'),
    html: wrap(subject, [
      p('รหัสผ่านของบัญชี GIPDP ที่ใช้อีเมลนี้เพิ่งถูกเปลี่ยน และทุกอุปกรณ์ออกจากระบบแล้ว', 'font-size:15px;color:#1e293b;'),
      p('ถ้าไม่ใช่คุณ สามารถขอลิงก์ตั้งรหัสผ่านใหม่ได้ทันที'),
      ctaButton(forgot, 'ขอลิงก์ตั้งรหัสผ่านใหม่'),
    ]),
  };
}

// The address as a log may show it: enough to tell two test accounts apart
const masked = (address) => address.replace(/^(.)[^@]*/, '$1***');

/**
 * Sends one email after the response has gone, so how long a send takes never
 * shows in the response time (V6.3.8), and a slow mail server never holds a
 * request open. Never throws; a failure is logged without the token or link.
 *
 * Without SMTP, development prints the confirm or reset link instead, marked as
 * such, so a developer can sign up or reset without a mail account. Production
 * without SMTP sends nothing: the routes that need a link refuse first (503),
 * and a notice (a changed password, a linked Google account) is skipped.
 *
 * @param {{ configured: boolean, send: Function }} mail
 * @param {{ kind: string, to: string, subject: string, text: string, html: string }} message
 * @param {{ link?: string }} [extra] - The confirm or reset link, for development's log only
 */
export function sendAfterResponse(mail, message, { link } = {}) {
  setImmediate(async () => {
    if (!mail.configured) {
      if (isProduction) return;
      const what = link ? `${message.kind} link: ${link}` : `no link (${message.kind})`;
      console.info(`[auth] Development only, no SMTP. Email to ${masked(message.to)}, ${what}`);
      return;
    }
    try {
      await mail.send({ to: message.to, subject: message.subject, text: message.text, html: message.html });
    } catch (error) {
      console.warn(`[auth] The ${message.kind} email could not be sent: ${error.message}`);
    }
  });
}
