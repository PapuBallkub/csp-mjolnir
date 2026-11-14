import mongoose from 'mongoose';

// Shape only. Behaviour, event triggers, and snapshot builders live in
// features/notifications (0003). Stores immutable notification event logs
// (FR-13, FR-14, FR-16, FR-18).
//
// Uses a polymorphic Mixed snapshot so each notification type ('match',
// 'deadline', 'amendment', etc.) stores only its own clean payload with zero
// unused null fields in MongoDB.
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['match', 'amendment', 'deadline', 'status_change'],
      required: true,
    },

    // Immutable snapshot payload shaped by the service layer helper functions
    // (e.g. buildMatchSnapshot, buildDeadlineSnapshot)
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // User interaction state (powers header bell unread badge and toast dismissal)
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },

    // Email dispatch state: allows creating notification data beforehand (staging)
    // while sending emails separately at the scheduled digest time (08:00 AM).
    emailSent: { type: Boolean, default: false, index: true },
    emailSkipped: { type: Boolean, default: false, index: true },
    emailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Compound index for fast unread count and chronological user feed queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
