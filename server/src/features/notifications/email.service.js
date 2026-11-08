import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { env, isEmailConfigured } from '#common/config/env.js';
import { renderMatchDigestEmail } from './templates/match-digest.template.js';

let transporterInstance = null;

/**
 * Returns a cached Nodemailer transporter instance configured with env credentials.
 * Reusing the transporter pool avoids reconnecting on every dispatched email.
 */
export function getTransporter() {
  if (transporterInstance) return transporterInstance;

  transporterInstance = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: env.email.user,
      pass: env.email.pass,
    },
  });

  return transporterInstance;
}

/**
 * Generates an HMAC SHA-256 token for 1-click PDPA email unsubscription.
 * Stateless: verifies without needing to store tokens in the database.
 */
export function createUnsubscribeToken(userId) {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(String(userId))
    .digest('hex');
}

/**
 * Validates the HMAC token sent from the email unsubscribe link.
 */
export function verifyUnsubscribeToken(userId, token) {
  if (!userId || !token) return false;
  try {
    const expected = createUnsubscribeToken(userId);
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(token);
    if (expectedBuf.length !== givenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, givenBuf);
  } catch {
    return false;
  }
}

/**
 * Core generic sender: delivers any email with any subject and HTML content.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML body string
 * @returns {Promise<{ sent: boolean, reason?: string, messageId?: string }>}
 */
export async function sendEmail({ to, subject, html }) {
  if (!isEmailConfigured) {
    console.warn('[email.service] Email skipped: SMTP credentials are not configured in server/.env.');
    return { sent: false, reason: 'not_configured' };
  }

  if (!to) {
    return { sent: false, reason: 'missing_recipient_email' };
  }

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: env.email.from,
    to,
    subject,
    html,
  });

  return { sent: true, messageId: info.messageId };
}

// Real Notification sender function separate to be notification for: Match-tor

/**
 * Dispatches a match digest email. The subject line and HTML are generated together
 * by email-template.js.
 *
 * @param {Object} options
 * @param {Object} options.user - User document or object with email, name, _id
 * @param {Array} options.matchedItems - Array of matched tender receipt objects
 */
export async function sendMatchDigestEmail({ user, matchedItems }) {
  if (!user?.email) {
    return { sent: false, reason: 'missing_recipient_email' };
  }

  if (!matchedItems || matchedItems.length === 0) {
    return { sent: false, reason: 'no_matched_items' };
  }

  const userId = String(user._id ?? user.id ?? '');
  const token = createUnsubscribeToken(userId);
  const unsubscribeUrl = `${env.corsOrigin}/notifications?unsubscribe=true&uid=${userId}&token=${token}`;

  const recipientName = user.name?.trim() || user.email.split('@')[0];

  const { subject, html } = renderMatchDigestEmail({
    recipientName,
    matchedItems,
    unsubscribeUrl,
    appUrl: env.corsOrigin,
  });

  return sendEmail({
    to: user.email,
    subject,
    html,
  });
}
