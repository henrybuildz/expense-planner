import { createClient } from '@supabase/supabase-js';

// Both values are PUBLIC by design (they ship in the browser bundle). What protects your data is
// Row Level Security in the database, not secrecy of these. NEVER put a secret / service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Without both variables (e.g. a plain local build) the app simply runs local-only, as before.
export const syncEnabled = Boolean(url && key);

export const supabase = syncEnabled
  ? createClient(url, key, {
      auth: {
        // PKCE keeps tokens out of the URL. supabase-js defaults to the older 'implicit' flow.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
