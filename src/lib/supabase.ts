import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const isPlaceholder = (v: string | undefined) =>
  !v || v.startsWith("REPLACE_") || !v.includes(".");

let _client: SupabaseClient | null = null;

if (!isPlaceholder(url) && !isPlaceholder(anonKey)) {
  try {
    _client = createClient(url!, anonKey!);
  } catch (e) {
    console.error("Supabase client failed to initialise:", e);
  }
} else {
  console.warn(
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env " +
    "(Project Settings → API in your Supabase dashboard). Auth will be disabled until then."
  );
}

export const supabase = _client;
export const supabaseReady = _client !== null;
