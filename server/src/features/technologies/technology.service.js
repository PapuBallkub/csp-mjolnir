import mongoose from 'mongoose';
import { escapeRegex } from '#common/utils/escape-regex.js';
import { Technology } from '#models/index.js';
import { STARTER_TECHNOLOGIES } from '#pipeline/extraction/references/technologies.js';

// The categories the vocabulary uses (database, os, …); a request may name one
// of these or none, so a person's typo can't start a nineteenth
const CATEGORIES = new Set(STARTER_TECHNOLOGIES.map((t) => t.category));

/**
 * Returns all technologies in the vocabulary, sorted alphabetically.
 * Falls back to STARTER_TECHNOLOGIES if the collection has not been seeded yet
 * or if the database is offline/disconnected.
 */
export async function getAllTechnologies() {
  if (mongoose.connection.readyState === 1) {
    try {
      const fromDb = await Technology.find({ status: 'confirmed' }, { name: 1, category: 1, _id: 0 })
        .sort({ name: 1 })
        .lean();
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
  // A number or an object here used to reach .trim() and give a 500
  if (name !== undefined && typeof name !== 'string') {
    const error = new Error('ชื่อเทคโนโลยีต้องเป็นข้อความ');
    error.status = 400;
    throw error;
  }
  // None (absent, null, or a form's empty choice) or one of the vocabulary's,
  // in any case: 'Language' is 'language'
  const noCategory = category === undefined || category === null || category === '';
  const categoryKey = typeof category === 'string' ? category.trim().toLowerCase() : null;
  if (!noCategory && !CATEGORIES.has(categoryKey)) {
    const error = new Error('หมวดหมู่ไม่ถูกต้อง');
    error.status = 400;
    throw error;
  }

  const trimmed = name?.trim();
  if (!trimmed || trimmed.length === 0) {
    const error = new Error('กรุณาระบุชื่อเทคโนโลยี');
    error.status = 400;
    throw error;
  }
  if (trimmed.length > 100) {
    const error = new Error('ชื่อเทคโนโลยีต้องมีความยาวไม่เกิน 100 ตัวอักษร');
    error.status = 400;
    throw error;
  }

  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');

  if (mongoose.connection.readyState === 1) {
    const existing = await Technology.findOne({
      $or: [{ key }, { aliases: key }, { name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') }],
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
      category: categoryKey || null,
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
    technology: { name: trimmed, category: categoryKey || null, status: 'new' },
    alreadyExists: false,
  };
}

