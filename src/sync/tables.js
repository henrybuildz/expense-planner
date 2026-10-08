// How each local data set maps to its Supabase table. The sync engine is generic over these.
//   toList / fromList : local state <-> flat list of records (budgets are a { category: limit } map)
//   toRow / fromRow   : record <-> database row (snake_case, ISO dates)
//   clean             : validates rows coming FROM the server with the same sanitizers used for
//                       localStorage and backups, so a malformed row can never corrupt local data
import { sanitizeBudgets, sanitizeSubscriptions, sanitizeTransactions } from '../utils/sanitize';

const budgetsToMap = (list) => Object.fromEntries(list.map((r) => [r.category, r.limit]));
const budgetsToList = (map) => Object.entries(map).map(([category, limit]) => ({ category, limit }));

export const TABLES = {
  transactions: {
    remote: 'transactions',
    key: 'id',
    conflict: 'user_id,id',
    fields: ['id', 'type', 'amount', 'category', 'date', 'notes'],
    toList: (state) => state,
    fromList: (list) => list,
    toRow: (r, userId) => ({
      user_id: userId,
      id: r.id,
      type: r.type,
      amount: r.amount,
      category: r.category,
      date: r.date,
      notes: r.notes,
      deleted_at: null, // an upsert also "un-deletes" a record that was removed earlier
    }),
    fromRow: (w) => ({
      id: w.id,
      type: w.type,
      amount: Number(w.amount),
      category: w.category,
      date: w.date,
      notes: w.notes ?? '',
    }),
    clean: (list) => sanitizeTransactions(list) ?? [],
  },

  budgets: {
    remote: 'budgets',
    key: 'category',
    conflict: 'user_id,category',
    fields: ['category', 'limit'],
    toList: budgetsToList,
    fromList: budgetsToMap,
    toRow: (r, userId) => ({
      user_id: userId,
      category: r.category,
      monthly_limit: r.limit,
      deleted_at: null,
    }),
    fromRow: (w) => ({ category: w.category, limit: Number(w.monthly_limit) }),
    clean: (list) => budgetsToList(sanitizeBudgets(budgetsToMap(list)) ?? {}),
  },

  subscriptions: {
    remote: 'subscriptions',
    key: 'id',
    conflict: 'user_id,id',
    fields: ['id', 'name', 'cost', 'cycle', 'nextDue', 'lastPaid', 'anchorDay'],
    toList: (state) => state,
    fromList: (list) => list,
    toRow: (r, userId) => ({
      user_id: userId,
      id: r.id,
      name: r.name,
      cost: r.cost,
      cycle: r.cycle,
      next_due: r.nextDue,
      last_paid: r.lastPaid || null,
      anchor_day: r.anchorDay,
      deleted_at: null,
    }),
    fromRow: (w) => ({
      id: w.id,
      name: w.name,
      cost: Number(w.cost),
      cycle: w.cycle,
      nextDue: w.next_due,
      lastPaid: w.last_paid ?? '',
      anchorDay: w.anchor_day,
    }),
    clean: (list) => sanitizeSubscriptions(list) ?? [],
  },
};

export const TABLE_NAMES = Object.keys(TABLES);
