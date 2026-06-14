import { createClient } from "@supabase/supabase-js";

// Fallbacks prevent module-level throws during Next.js prerender;
// all real Supabase calls happen client-side in useEffect.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
);

export type DBSound = {
  id: string;
  name: string;
  url: string;
  created_at: string;
};
