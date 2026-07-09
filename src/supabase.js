import { createClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://ankhvpcykeyexwnwcmqa.supabase.co";
const fallbackPublishableKey = "sb_publishable_7hkh3ti-D3EE8CBFpw7wKw_XWnaEr6B";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  fallbackPublishableKey;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const publicSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
