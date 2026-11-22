import { env, isProduction } from '#common/config/env.js';

// The three emails accounts send (0041). None carries anything a user typed,
// not even their name, so there is nothing to escape: the only variable part
// is a link we built. Thai, plain and short (AGENTS.md §7). Transactional mail,
// so it needs no consent, unlike FR-14's match emails.

const LINK_HOURS = 24;

/** Where the confirm page is. The token goes after `#`, so no server log sees it. */
export const confirmLink = (token) => `${env.corsOrigin}/auth/verify#token=${token}`;

const wrap = (paragraphs) =>
  [
    '<div style="font-family:sans-serif;font-size:15px;line-height:1.7;color:#1a1a1a;max-width:520px">',
    ...paragraphs.map((p) => `<p>${p}</p>`),
    '<p style="color:#666;font-size:13px">GIPDP เป็นเครื่องมือค้นหาประกาศจัดซื้อจัดจ้างภาครัฐ ไม่ใช่ระบบของรัฐ การยื่นข้อเสนอทั้งหมดทำบนระบบ e-GP</p>',
    '</div>',
  ].join('');

/** Someone signed up with this address: the link that creates the account. */
export function confirmEmail(to, token) {
  const link = confirmLink(token);
  return {
    kind: 'confirm',
    to,
    subject: 'ยืนยันอีเมลเพื่อเริ่มใช้ GIPDP',
    text: [
      'มีคนสมัครใช้ GIPDP ด้วยอีเมลนี้',
      `ถ้าเป็นคุณ เปิดลิงก์นี้แล้วกรอกรหัสผ่านที่ตั้งไว้ตอนสมัคร: ${link}`,
      `ลิงก์ใช้ได้ครั้งเดียว ภายใน ${LINK_HOURS} ชั่วโมง`,
      'ถ้าไม่ใช่คุณ ไม่ต้องทำอะไร บัญชีจะไม่ถูกสร้างจนกว่าจะยืนยัน',
    ].join('\n\n'),
    html: wrap([
      'มีคนสมัครใช้ GIPDP ด้วยอีเมลนี้',
      `ถ้าเป็นคุณ <a href="${link}">เปิดลิงก์นี้</a> แล้วกรอกรหัสผ่านที่ตั้งไว้ตอนสมัคร`,
      `ลิงก์ใช้ได้ครั้งเดียว ภายใน ${LINK_HOURS} ชั่วโมง`,
      'ถ้าไม่ใช่คุณ ไม่ต้องทำอะไร บัญชีจะไม่ถูกสร้างจนกว่าจะยืนยัน',
    ]),
  };
}

/** Someone tried to sign up with an address that already has an account. */
export function alreadyRegisteredEmail(to) {
  const signIn = `${env.corsOrigin}/auth`;
  return {
    kind: 'already-registered',
    to,
    subject: 'มีคนพยายามสมัครด้วยอีเมลของคุณ',
    text: [
      'มีคนพยายามสมัครใช้ GIPDP ด้วยอีเมลนี้ แต่อีเมลนี้มีบัญชีอยู่แล้ว',
      `ถ้าเป็นคุณ เข้าสู่ระบบได้เลย (ด้วย Google ถ้าคุณสมัครด้วย Google): ${signIn}`,
      'ถ้าไม่ใช่คุณ ไม่มีอะไรเปลี่ยนแปลง บัญชีของคุณยังเหมือนเดิม',
    ].join('\n\n'),
    html: wrap([
      'มีคนพยายามสมัครใช้ GIPDP ด้วยอีเมลนี้ แต่อีเมลนี้มีบัญชีอยู่แล้ว',
      `ถ้าเป็นคุณ <a href="${signIn}">เข้าสู่ระบบได้เลย</a> (ด้วย Google ถ้าคุณสมัครด้วย Google)`,
      'ถ้าไม่ใช่คุณ ไม่มีอะไรเปลี่ยนแปลง บัญชีของคุณยังเหมือนเดิม',
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
  return {
    kind: 'google-linked',
    to,
    subject: 'บัญชี Google เชื่อมกับบัญชีของคุณแล้ว',
    text: [
      'บัญชี Google ที่ใช้อีเมลนี้เพิ่งถูกเชื่อมกับบัญชี GIPDP ของคุณ จากนี้เข้าสู่ระบบด้วย Google ได้',
      'ถ้าไม่ใช่คุณ แปลว่ามีคนอื่นเข้าถึงบัญชี Google ที่ใช้อีเมลนี้ได้ ให้เปลี่ยนรหัสผ่าน Google และตรวจความปลอดภัยของบัญชีที่ https://myaccount.google.com/security',
    ].join('\n\n'),
    html: wrap([
      'บัญชี Google ที่ใช้อีเมลนี้เพิ่งถูกเชื่อมกับบัญชี GIPDP ของคุณ จากนี้เข้าสู่ระบบด้วย Google ได้',
      'ถ้าไม่ใช่คุณ แปลว่ามีคนอื่นเข้าถึงบัญชี Google ที่ใช้อีเมลนี้ได้ ให้เปลี่ยนรหัสผ่าน Google และตรวจความปลอดภัยของบัญชีที่ https://myaccount.google.com/security',
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
 * Without SMTP, development prints the confirm link instead, marked as such,
 * so a developer can sign up without a mail account. Production never gets
 * here without SMTP: registration refuses first.
 *
 * @param {{ configured: boolean, send: Function }} mail
 * @param {{ kind: string, to: string, subject: string, text: string, html: string }} message
 * @param {{ link?: string }} [extra] - The confirm link, for development's log only
 */
export function sendAfterResponse(mail, message, { link } = {}) {
  setImmediate(async () => {
    if (!mail.configured) {
      if (isProduction) return;
      const what = link ? `confirm link: ${link}` : `no link (${message.kind})`;
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
