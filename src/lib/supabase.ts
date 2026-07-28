// Rollout cloud backend — its OWN Supabase project (never Th3Circle's DB).
// Fill these when the "rollout" project exists; empty values = the app runs
// in local mode (localStorage only) exactly as before.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "";           // https://<rollout-ref>.supabase.co
export const SUPABASE_ANON_KEY = "";      // anon / publishable key

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
