import mongoose from 'mongoose';

// Shape only. Writes and hashing live in features/auth (0003).
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      // Normalized on the way in, so the unique index catches casing variants.
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      // Optional since 0005: an account created through Google has no password.
      // features/auth is what guarantees every user has one credential or the other.
      select: false,
    },
    googleId: {
      type: String,
      // sparse, or every password-only user collides on a null googleId.
      unique: true,
      sparse: true,
    },
    // FR08 consent. A field, so it can be withdrawn later.
    notificationConsent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
