import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type AdminClient = SupabaseClient<Database>

/**
 * Service-role Supabase client for server-only work (cron workers, publishing).
 * Bypasses RLS — never import this into anything that reaches the browser.
 *
 * Deliberately a function, not a module-scope singleton: creating the client at
 * module scope throws `supabaseUrl is required` during `next build` page-data
 * collection when the env vars aren't present in that environment, which is
 * exactly what broke every Vercel Preview deployment (HANDOFF.md known issue #6,
 * still un-hardened in src/app/api/extension-key/route.ts). Keep it lazy.
 */
export function createAdminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client is not configured (need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)'
    )
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
