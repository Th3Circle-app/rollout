// Rollout cloud backend — its OWN Supabase project (never Th3Circle's DB).
// Fill these when the "rollout" project exists; empty values = the app runs
// in local mode (localStorage only) exactly as before.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://nnbofygbioxgujzxwznj.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYm9meWdiaW94Z3Vqenh3em5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMjY2NDcsImV4cCI6MjEwMDgwMjY0N30.oHEzJaaWIHyTe1I1fc9t4MxoU76E-VlhgwZO-BMaRfQ"; // anon key (public by design, guarded by RLS)

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
