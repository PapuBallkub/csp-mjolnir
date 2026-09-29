import mongoose from 'mongoose';

// Shape only. Writes and hashing live in features/auth (0003).
// Schema specification: docs/database/user-schema.md
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
    // Not required, for the same reason passwordHash is not: signInWithGoogle
    // creates accounts through findOneAndUpdate(upsert), where runValidators is
    // off by default, so a required field there is enforced or not depending on
    // an option nobody set. Shape here, invariant in features/auth — see 0005.
    // Characters, not bytes: the 72-byte ceiling on a password exists because
    // bcrypt truncates, and there is no such reason to give a Thai name ~26.
    name: {
      type: String,
      trim: true,
      default: '',
      maxlength: 80,
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
    // The only authorization fact about an account. An enum rather than a
    // permissions array because there are two kinds of person here and the
    // second kind is us; a role nobody can self-assign is the whole point, so
    // it is granted out of band — see 0011 and `npm run role`.
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
