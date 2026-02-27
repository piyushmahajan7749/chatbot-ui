import { Database } from "@/supabase/types"
import { createBrowserClient } from "@supabase/ssr"

// When NEXT_PUBLIC_SUPABASE_PROXY is "true", route browser requests through
// our own domain to bypass ISP-level DNS blocking of supabase.co (e.g. in India).
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_PROXY === "true"
    ? "/supabase-proxy"
    : process.env.NEXT_PUBLIC_SUPABASE_URL!

export const supabase = createBrowserClient<Database>(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
