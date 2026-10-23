import { createClient } from '@supabase/supabase-js'

// The Supabase client, from the project's URL and public (anon / publishable) key in .env.local:
//   VITE_SUPABASE_URL=https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon or publishable key>
// Without them there's no client, and the account features say so instead of failing.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null
