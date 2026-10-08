// Thin wrapper over the Supabase client. Kept separate so the engine can be tested with a fake.
const UPSERT_CHUNK = 500;
const DELETE_CHUNK = 50; // ids travel in the URL for .in(); keep the URL short
const PAGE = 1000; // Supabase returns at most 1000 rows per request by default

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export function createRemote(client) {
  return {
    // Insert-or-update. The database stamps updated_at itself (clients cannot).
    async upsert(table, rows) {
      for (const part of chunks(rows, UPSERT_CHUNK)) {
        const { error } = await client.from(table.remote).upsert(part, { onConflict: table.conflict });
        if (error) throw error;
      }
    },

    // Deletes are soft: setting deleted_at is what tells the other devices to remove the record.
    async softDelete(table, keys) {
      const deletedAt = new Date().toISOString();
      for (const part of chunks(keys, DELETE_CHUNK)) {
        const { error } = await client
          .from(table.remote)
          .update({ deleted_at: deletedAt })
          .in(table.key, part);
        if (error) throw error;
      }
    },

    // Every row (including soft-deleted ones) changed at or after `cursor`, oldest first.
    // `>=` plus a stable order means rows sharing one timestamp can never be skipped;
    // re-reading the boundary row is harmless because applying a row is idempotent.
    async changedSince(table, cursor) {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        let query = client.from(table.remote).select('*');
        if (cursor) query = query.gte('updated_at', cursor);
        const { data, error } = await query
          .order('updated_at', { ascending: true })
          .order(table.key, { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < PAGE) break;
      }
      return rows;
    },
  };
}
