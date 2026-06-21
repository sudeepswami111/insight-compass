import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const login = "insightforge_" + Math.floor(Math.random() * 1000000);
  const domain = "1secmail.com";
  const email = `${login}@${domain}`;
  const password = "Testing-" + crypto.randomUUID() + "!";
  
  console.log(`[1] Signing up with ${email}...`);
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  
  if (signUpError) {
    console.error("Signup failed:", signUpError.message);
    return;
  }
  
  console.log("[2] Waiting for confirmation email...");
  let messageId = null;
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
    const msgs = await res.json();
    if (msgs.length > 0) {
      messageId = msgs[0].id;
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  
  if (!messageId) {
    console.error("No email received within 60s");
    return;
  }
  
  console.log(`[3] Reading email content (id: ${messageId})...`);
  const msgRes = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${messageId}`);
  const msgBody = await msgRes.json();
  
  const html = msgBody.htmlBody || msgBody.textBody;
  const linkMatch = html.match(/https?:\/\/[^\s"'<]+/);
  if (!linkMatch) {
    console.error("Could not find confirmation link in email");
    return;
  }
  
  const confirmLink = linkMatch[0];
  console.log(`[4] Clicking confirmation link...`);
  const confirmRes = await fetch(confirmLink, { redirect: "follow" });
  console.log("Confirmation status:", confirmRes.status);
  
  console.log("[5] Verifying login...");
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (loginError) {
    console.error("Login failed after confirmation:", loginError.message);
  } else {
    console.log("✅ SUCCESS!");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  }
}

main().catch(console.error);
