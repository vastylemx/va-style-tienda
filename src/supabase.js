import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ankhvpcykeyexwnwcmqa.supabase.co";

const supabaseKey =
  "sb_publishable_7hkh3ti-D3EE8CBFpw7wKw_XWnaEr6B";

export const supabase = createClient(supabaseUrl, supabaseKey);