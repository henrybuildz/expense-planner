import { createClient } from '@supabase/supabase-js';

// Both values are PUBLIC by design (they ship in the browser bundle). What protects your data is
// Row Level Security in the database, not secrecy of these. NEVER put a secret / service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// When sign-in fails (consent denied, wrong client secret, ...) Supabase sends the browser back with
// ?error_description=... in the URL. Read it BEFORE the client starts, then tidy the address bar, so the
// app can actually tell the user what went wrong instead of silently showing the signed-out page.
function takeAuthErrorFromUrl() {
  try {
    const here = new URL(window.location.href);
    const hash = new URLSearchParams(here.hash.replace(/^#/, ''));
    const message =
      here.searchParams.get('error_description') || hash.get('error_description') ||
      here.searchParams.get('error') || hash.get('error') || '';
    if (!message) return '';
    ['error', 'error_code', 'error_description'].forEach((k) => here.searchParams.delete(k));
    here.hash = '';
    window.history.replaceState(window.history.state, '', here.toString());
    return message.replace(/\+/g, ' ').slice(0, 300);
  } catch {
    return '';
  }
}
// Without both variables (e.g. a plain local build) the app simply runs local-only, as before.
export const syncEnabled = Boolean(url && key);

// Only touch the address bar when sync is actually configured.
export const urlAuthError = syncEnabled ? takeAuthErrorFromUrl() : '';

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
