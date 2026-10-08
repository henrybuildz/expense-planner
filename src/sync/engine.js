// Sync engine. No React, no network code of its own: the server and the app state are injected,
// so the whole thing is unit-testable.
//
// Model
//   * The local data is the working copy. `meta.snapshot` remembers what the server last confirmed
//     (a fingerprint per record). "What changed locally" = current data compared with that snapshot,
//     so adds, edits, deletes, imports and "delete all" are all detected without hooks in every action.
//   * One sync = for each table: PUSH local changes, then PULL changes made elsewhere.
//     Pushing first means a local change can never be overwritten by an older remote copy.
//   * Conflicts (same record edited on two devices): the last one to reach the server wins.
import { TABLE_NAMES, TABLES } from './tables';

// Objects keyed by record id. No prototype, so an id like "__proto__" is just a normal key.
export const bag = () => Object.create(null);

// Stable fingerprint of a record (fixed field order, so it never depends on key order).
export const canon = (table, record) => JSON.stringify(table.fields.map((f) => record[f]));

/** Local changes not yet confirmed by the server. */
export function diffTable(table, snapshot, records) {
  const upserts = [];
  const present = new Set();
  for (const record of records) {
    const key = record[table.key];
    present.add(key);
    if (snapshot[key] !== canon(table, record)) upserts.push(record);
  }
  const deletes = Object.keys(snapshot).filter((key) => !present.has(key));
  return { upserts, deletes };
}

// Safety brake. Local data that vanishes (corrupt storage, a bug, evicted storage) looks exactly like
// "the user deleted everything", and syncing it would delete the whole account on every device.
// So a sync that would delete many records at once stops and asks, unless the user just did a
// deliberate bulk action (Delete all data, Replace import).
export const MASS_DELETE_MIN = 5;
export const isMassDelete = (deleteCount, snapshotSize) =>
  deleteCount >= MASS_DELETE_MIN && deleteCount >= snapshotSize / 2;

export class MassDeleteError extends Error {
  constructor(tables) {
    super('Many records are missing from this device');
    this.name = 'MassDeleteError';
    this.tables = tables; // { [tableName]: { deletes, total } }
  }
}

export const hasPendingChanges = (meta, getRecords) =>
  TABLE_NAMES.some((name) => {
    const table = TABLES[name];
    const { upserts, deletes } = diffTable(table, meta.snapshot[name] || bag(), table.toList(getRecords(name)));
    return upserts.length > 0 || deletes.length > 0;
  });

/**
 * Pure: apply server rows to a list of local records.
 * Live rows are validated; tombstones remove the record. Returns the new list plus what happened.
 */
export function applyRows(table, records, rows) {
  const byKey = new Map(records.map((r) => [r[table.key], r]));
  const live = [];
  const removed = [];
  for (const row of rows) {
    if (row.deleted_at) removed.push(row[table.key]);
    else live.push(table.fromRow(row));
  }
  const applied = table.clean(live);
  for (const key of removed) byKey.delete(key);
  for (const record of applied) byKey.set(record[table.key], record);
  return { records: [...byKey.values()], applied, removed, skipped: live.length - applied.length };
}

/**
 * One full sync. Throws on the first failure; everything confirmed so far stays recorded in
 * `meta`, so the next attempt resumes where this one stopped.
 *   remote : { upsert(table, rows), softDelete(table, keys), changedSince(table, cursor) }
 *   store  : { get(name) -> current state, update(name, fn) -> queue a functional state update }
 *   meta   : { snapshot, cursors, save() }
 */
export async function runSync({ remote, userId, store, meta, allowMassDelete = false }) {
  const report = { pushed: 0, deleted: 0, pulled: 0, skipped: 0 };

  // Check every table BEFORE pushing anything, so a blocked sync changes nothing on the server.
  if (!allowMassDelete) {
    const suspicious = {};
    for (const name of TABLE_NAMES) {
      const table = TABLES[name];
      const snapshot = meta.snapshot[name] || bag();
      const { deletes } = diffTable(table, snapshot, table.toList(store.get(name)));
      const total = Object.keys(snapshot).length;
      if (isMassDelete(deletes.length, total)) suspicious[name] = { deletes: deletes.length, total };
    }
    if (Object.keys(suspicious).length) throw new MassDeleteError(suspicious);
  }

  for (const name of TABLE_NAMES) {
    const table = TABLES[name];
    const snapshot = (meta.snapshot[name] ??= bag());

    // ---- push local changes
    const { upserts, deletes } = diffTable(table, snapshot, table.toList(store.get(name)));
    if (upserts.length) {
      await remote.upsert(table, upserts.map((r) => table.toRow(r, userId)));
      for (const r of upserts) snapshot[r[table.key]] = canon(table, r);
      report.pushed += upserts.length;
    }
    if (deletes.length) {
      await remote.softDelete(table, deletes);
      for (const key of deletes) delete snapshot[key];
      report.deleted += deletes.length;
    }
    meta.save();

    // ---- pull changes made on other devices
    const rows = await remote.changedSince(table, meta.cursors[name] ?? null);
    if (rows.length) {
      const { applied, removed, skipped } = applyRows(table, table.toList(store.get(name)), rows);
      // Re-applied on the freshest state at commit time, so edits made while we waited are kept.
      store.update(name, (prev) => table.fromList(applyRows(table, table.toList(prev), rows).records));
      for (const record of applied) snapshot[record[table.key]] = canon(table, record);
      for (const key of removed) delete snapshot[key];
      meta.cursors[name] = rows[rows.length - 1].updated_at; // rows arrive oldest-first
      report.pulled += applied.length + removed.length;
      report.skipped += skipped;
    }
    meta.save();
  }
  return report;
}
