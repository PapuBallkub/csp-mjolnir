import mongoose from 'mongoose';

// Shape only. Hashing, comparison, and every write to this collection live in
// features/auth — see docs/decisions/0003-feature-based-server-layout.md.
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      // Normalized on the way in so the unique index is what enforces "one
      // account per address". Without this, Somchai@example.co.th and
      // somchai@example.co.th are two accounts and the second person to sign up
      // is quietly locked out of the first one's alerts.
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      // Kept out of the default projection. 0003 is honest that any feature can
      // reach any model through mongoose's global registry, so the hash opting
      // out of every incidental find() is worth the one line — features/auth
      // asks for it by name in the one place that compares it.
      select: false,
    },
    // FR08 mails people only with consent, so consent has to be a field someone
    // can withdraw later, not a checkbox we read once at signup and forget.
    notificationConsent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
