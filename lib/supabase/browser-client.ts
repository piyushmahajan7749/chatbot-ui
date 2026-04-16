import { Database } from "@/supabase/types"
import { createBrowserClient } from "@supabase/ssr"

// When NEXT_PUBLIC_SUPABASE_PROXY is "true", route browser requests through
// our own domain to bypass ISP-level DNS blocking of supabase.co (e.g. in India).
// Supabase-js requires an absolute URL (it internally calls `new URL(...)`),
// so on the browser we prefix the proxy path with window.location.origin.
// During SSR we fall back to the real Supabase URL — this module is only
// *evaluated* on the server, the client itself is used in the browser.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_PROXY === "true" &&
  typeof window !== "undefined"
    ? `${window.location.origin}/supabase-proxy`
    : process.env.NEXT_PUBLIC_SUPABASE_URL!

export const supabase = createBrowserClient<Database>(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
