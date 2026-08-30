const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when both Supabase env vars are present at runtime. */
export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl && supabaseAnonKey
);
