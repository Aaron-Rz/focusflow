import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Single browser Supabase client (account-based auth).
 *
 * Session is persisted in localStorage (supabase-js default), which works
 * reliably inside an installed iOS PWA. OAuth uses the PKCE flow and the code
 * exchange is handled automatically via `detectSessionInUrl` on the callback page.
 */
let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (_client) return _client;
  _client = createSupabaseClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return _client;
}

/** Convenience: get current session user id, or null */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.user.id ?? null;
}
