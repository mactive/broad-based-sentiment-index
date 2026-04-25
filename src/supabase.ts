import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseSetup = {
  missingEnv: string[];
  redirectTo: string;
  url: string | null;
  publishableKey: string | null;
};

let client: SupabaseClient | null | undefined;

export function getSupabaseSetup(): SupabaseSetup {
  const url = readEnv("VITE_SUPABASE_URL");
  const publishableKey = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ?? readEnv("VITE_SUPABASE_ANON_KEY");
  const missingEnv: string[] = [];

  if (!url) missingEnv.push("VITE_SUPABASE_URL");
  if (!publishableKey) missingEnv.push("VITE_SUPABASE_PUBLISHABLE_KEY");

  const redirect = typeof window === "undefined" ? "/" : new URL(window.location.href);
  if (redirect instanceof URL) redirect.hash = "";

  return {
    missingEnv,
    redirectTo: redirect instanceof URL ? redirect.toString() : redirect,
    url,
    publishableKey
  };
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const setup = getSupabaseSetup();
  if (!setup.url || !setup.publishableKey) {
    client = null;
    return client;
  }

  client = createClient(setup.url, setup.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  return client;
}

function readEnv(name: string): string | null {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
