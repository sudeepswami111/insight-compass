import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const email = `test-${Date.now()}@example.com`;
  console.log("Signing up with", email);
  const { data, error } = await supabase.auth.signUp({
    email,
    password: "Password123!",
  });
  if (error) {
    console.error("Sign up error:", error.message);
  } else {
    console.log("Sign up success:", data.user?.id);
    console.log("Session exists?", !!data.session);
  }
}

test();
