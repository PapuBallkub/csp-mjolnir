import mongoose from 'mongoose';

// Shape only. Issuing, checking and spending tokens live in features/auth (0003).
// Schema specification: docs/database/email-token-schema.md
//
// A one-time token sent by email. For 'verify-email' it also holds the whole
// registration, so no user exists until the address is confirmed: nothing
// unconfirmed can be signed in to, linked to Google, or emailed (0041).
// 'reset-password' is for password reset (planned).
const emailTokenSchema = new mongoose.Schema(
  {
    purpose: {
      type: String,
      enum: ['verify-email', 'reset-password'],
      required: true,
    },
    // Lowercased, as the user's own is, so one address finds all its tokens
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // SHA-256 of the token, in hex. The token itself is only ever in the email,
    // so a copy of this collection opens nothing.
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    // Mongo deletes a token about a minute after this (TTL index below); the
    // code still checks it, so a token is never good for that extra minute
    expiresAt: {
      type: Date,
      required: true,
    },
    // Wrong passwords at confirmation; the fifth deletes the token
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // 'verify-email' only: the registration, kept until it is confirmed.
    // The password's hash, made as the user's is (password.js), so confirming
    // can check the password typed again against it, and then move it over.
    passwordHash: {
      type: String,
      select: false,
    },
    name: {
      type: String,
      trim: true,
      default: '',
      maxlength: 80,
    },
    // FR08 consent, given on the form; it takes effect only once confirmed
    notificationConsent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Expired registrations leave on their own, which suits PDPA: no unconfirmed
// personal data is kept past its day
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailToken = mongoose.model('EmailToken', emailTokenSchema);
