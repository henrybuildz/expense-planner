import { KEYS } from '../constants/storage';
import { TABLE_NAMES } from './tables';
import { bag } from './engine';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

/**
 * Sync bookkeeping, persisted in localStorage:
 *   userId   : the account this device last synced with (null = never)
 *   cursors  : per table, the newest server timestamp already pulled
 *   snapshot : per table, record id -> fingerprint of what the server last confirmed
 * Corrupt or missing data simply means "never synced": the next sync merges everything
 * (safe, because records have unique ids and applying them is idempotent).
 */
export function loadMeta(storage = window.localStorage) {
  const meta = {
    userId: null,
    cursors: {},
    snapshot: {},
    save() {
      try {
        storage.setItem(
          KEYS.sync,
          JSON.stringify({ userId: meta.userId, cursors: meta.cursors, snapshot: meta.snapshot })
        );
      } catch {
        /* storage full or blocked: the next sync just redoes some work */
      }
    },
    reset(userId) {
      meta.userId = userId;
      meta.cursors = {};
      meta.snapshot = {};
      meta.save();
    },
  };

  try {
    const raw = JSON.parse(storage.getItem(KEYS.sync));
    if (isObject(raw) && (raw.userId === null || typeof raw.userId === 'string')) {
      meta.userId = raw.userId;
      for (const name of TABLE_NAMES) {
        const cursor = raw.cursors && raw.cursors[name];
        if (typeof cursor === 'string') meta.cursors[name] = cursor;
        const snap = bag();
        if (isObject(raw.snapshot && raw.snapshot[name])) {
          for (const [key, value] of Object.entries(raw.snapshot[name])) {
            if (typeof value === 'string') snap[key] = value;
          }
        }
        meta.snapshot[name] = snap;
      }
    }
  } catch {
    /* treat as never synced */
  }
  return meta;
}
