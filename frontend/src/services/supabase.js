import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your environment variables.');
}

// Initialize the browser Supabase client.
// By default, Supabase persists the session to localStorage, which satisfies the
// requirement to keep the default session persistence behavior.
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
