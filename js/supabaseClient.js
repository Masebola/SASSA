// =============================================================
// Supabase client — shared configuration
//
// Every page that talks to Supabase imports the `supabase` object
// from this file, so the connection only has to be configured once.
//
// SETUP (see instructions.md, section "Supabase Project Setup"):
//   1. Create a Supabase project at https://supabase.com
//   2. In your project: Settings -> API
//   3. Copy the "Project URL" into SUPABASE_URL below
//   4. Copy the "anon public" key into SUPABASE_ANON_KEY below
//
// Do NOT paste the "service_role" key here — that key must never
// be used in frontend code. The anon key is safe for the browser
// because Row Level Security (see db/schema.sql) restricts what
// it can actually read or write.
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://rljjfdgaxkkpmxprlzdl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsampmZGdheGtrcG14cHJsemRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjQ4NjEsImV4cCI6MjEwNDYwMDg2MX0.6cJYIqxQ5J3-1MdyoxgBzdcH-aPFc7lTqSY9miDwXdU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Small helper other scripts use to bail out early with a clear
// message if someone forgets to fill in the keys above.
export function isConfigured() {
  return (
    SUPABASE_URL !== "https://rljjfdgaxkkpmxprlzdl.supabase.co" &&
    SUPABASE_ANON_KEY !== "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsampmZGdheGtrcG14cHJsemRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjQ4NjEsImV4cCI6MjEwNDYwMDg2MX0.6cJYIqxQ5J3-1MdyoxgBzdcH-aPFc7lTqSY9miDwXdU"
  );
}
