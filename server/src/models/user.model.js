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
      required: true,
      // Kept out of every query that does not ask for it by name.
      select: false,
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
