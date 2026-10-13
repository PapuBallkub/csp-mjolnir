import mongoose from 'mongoose';
import { Technology } from '#models/index.js';
import { STARTER_TECHNOLOGIES } from '#pipeline/extraction/references/technologies.js';

/**
 * Returns all technologies in the vocabulary, sorted alphabetically.
 * Falls back to STARTER_TECHNOLOGIES if the collection has not been seeded yet
 * or if the database is offline/disconnected.
 */
export async function getAllTechnologies() {
  if (mongoose.connection.readyState === 1) {
    try {
      const fromDb = await Technology.find({}, { name: 1, category: 1, _id: 0 }).sort({ name: 1 }).lean();
      if (fromDb.length > 0) {
        return fromDb;
      }
    } catch {
      // Fall through to starter technologies
    }
  }
  return STARTER_TECHNOLOGIES.map((t) => ({ name: t.name, category: t.category })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Handles user request to add a new technology or standard to the vocabulary.
 * If already known (by key or alias), returns existing entry.
 * If new, creates an entry with status 'new' for admin review.
 */
export async function requestTechnology({ name, category, userId }) {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length === 0) {
    const error = new Error('Name is required');
    error.status = 400;
    throw error;
  }
  if (trimmed.length > 100) {
    const error = new Error('Name cannot exceed 100 characters');
    error.status = 400;
    throw error;
  }

  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');

  if (mongoose.connection.readyState === 1) {
    const existing = await Technology.findOne({
      $or: [{ key }, { aliases: key }, { name: new RegExp(`^${trimmed}$`, 'i') }],
    }).lean();

    if (existing) {
      return {
        technology: { name: existing.name, category: existing.category, status: existing.status },
        alreadyExists: true,
      };
    }

    const created = await Technology.create({
      name: trimmed,
      key,
      category: category?.trim() || null,
      status: 'new',
      firstSeenIn: userId ? `user-request:${userId}` : 'user-request',
    });

    return {
      technology: { name: created.name, category: created.category, status: created.status },
      alreadyExists: false,
    };
  }

  // Graceful fallback when database is offline
  return {
    technology: { name: trimmed, category: category?.trim() || null, status: 'new' },
    alreadyExists: false,
  };
}

