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
    // Not required: a Google profile may come without a name, and an account
    // Google creates takes whatever it gives. Shape here, invariant in
    // features/auth — see 0005.
    // Characters, not bytes: a byte ceiling would give a Thai name about 26.
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
    // When the address was confirmed: by the emailed link (0041), or by Google
    // when it created or linked the account. Absent means never confirmed. No
    // default, so an account from before 0041 reads as unconfirmed, as it is.
    emailVerifiedAt: {
      type: Date,
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
    // ASVS V7.4.1, V7.4.5: Incremented on logout to invalidate active JWT sessions
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // FR-12. What the user can build: skills, budget range, certifications,
    // entity type, preferred archetypes, and max past portfolio.
    // Read by the match scorer (FR-13) and used to rank the catalog.
    // Stored as a subdocument, not a separate collection, because every
    // read of the user (requireAuth on every request) should carry it.
    profile: {
      skills: {
        type: [String],
        default: [],
        validate: {
          validator: (v) => v.length <= 150,
          message: 'You can save at most 150 skills.',
        },
      },
      budgetMin: { type: Number, default: 0, min: 0, max: 10_000_000_000 },
      budgetMax: { type: Number, default: 0, min: 0, max: 10_000_000_000 },
      certifications: {
        type: [String],
        default: [],
        validate: {
          validator: (v) => v.length <= 50,
          message: 'You can save at most 50 certifications.',
        },
      },
      entityType: {
        type: String,
        enum: ['juristic', 'individual'],
        default: 'juristic',
      },
      preferredArchetypes: {
        type: [String],
        default: [],
        validate: {
          validator: (v) => v.length <= 10,
          message: 'You can save at most 10 preferred archetypes.',
        },
      },
      maxPastPortfolioTHB: {
        type: Number,
        default: 0,
        min: 0,
        max: 10_000_000_000,
      },
      // FR-14. Preparation for consent-based match notification alerts.
      // Explicit opt-in consent (PDPA), score threshold, and alert frequency.
      matchNotification: {
        enabled: { type: Boolean, default: false },
        minScore: { type: Number, default: 75, min: 50, max: 95 },
        frequency: {
          type: String,
          enum: ['instant', 'daily', 'weekly'],
          default: 'daily',
        },
        includeSubcontract: { type: Boolean, default: true },
      },
      // FR-18. Customizable advance notice for approaching deadlines on watched projects (days before deadline).
      deadlineNoticeDays: {
        type: Number,
        default: 3,
        min: 1,
        max: 30,
      },
    },
    // FR-17. Personal watchlist of saved TOR projects.
    // Contains the e-GP project ID, savedAt, savedStatus, and seenChangeAt for dismissal.
    watchlist: {
      type: [
        {
          _id: false,
          projectId: {
            type: String,
            required: true,
            trim: true,
          },
          savedAt: {
            type: Date,
            default: Date.now,
          },
          // Lifecycle status when the user saved it (Draft, Open, etc.)
          savedStatus: {
            type: String,
            default: null,
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

userSchema.index({ 'watchlist.projectId': 1 });

export const User = mongoose.model('User', userSchema);
