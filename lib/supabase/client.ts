import { createBrowserClient } from "@supabase/ssr"

// When NEXT_PUBLIC_SUPABASE_PROXY is "true", route browser requests through
// our own domain to bypass ISP-level DNS blocking of supabase.co (e.g. in India).
// Supabase-js requires an absolute URL (it internally calls `new URL(...)`),
// so we resolve the proxy path against window.location.origin in the browser.
const getSupabaseUrl = () =>
  process.env.NEXT_PUBLIC_SUPABASE_PROXY === "true" &&
  typeof window !== "undefined"
    ? `${window.location.origin}/supabase-proxy`
    : process.env.NEXT_PUBLIC_SUPABASE_URL!

export const createClient = () =>
  createBrowserClient(
    getSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
