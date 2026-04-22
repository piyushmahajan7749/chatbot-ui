import { Brand } from "@/components/ui/brand"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { createClient } from "@/lib/supabase/server"
import { Database } from "@/supabase/types"
import { createServerClient } from "@supabase/ssr"
import { get } from "@vercel/edge-config"
import { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Login"
}

export default async function Login({
  searchParams
}: {
  searchParams: { message: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        }
      }
    }
  )
  let supabaseConnectionError: string | null = null
  let session: Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"] = null
  try {
    session = (await supabase.auth.getSession()).data.session
  } catch (e: any) {
    session = null
    supabaseConnectionError =
      e?.cause?.code === "ECONNREFUSED"
        ? `Supabase is unreachable at ${process.env.NEXT_PUBLIC_SUPABASE_URL}. If you're running locally, start it with "supabase start" (Docker required) and copy API URL + anon key from "supabase status" into .env.local.`
        : "Supabase is unreachable. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY and that Supabase is running."
  }

  if (session) {
    const { data: homeWorkspace, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("is_home", true)
      .maybeSingle()

    if (!homeWorkspace) {
      // If no home workspace exists (e.g., after database reset), redirect to setup
      console.log(
        "No home workspace found for user, redirecting to setup:",
        error?.message
      )
      return redirect("/setup")
    }
    return redirect(`/${homeWorkspace.id}/chat`)
  }

  const clearCacheAndLogout = async () => {
    "use server"

    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    // Sign out the user
    await supabase.auth.signOut()

    // Redirect to login page
    return redirect("/login?message=Cache cleared. Please sign in again.")
  }

  const signIn = async (formData: FormData) => {
    "use server"

    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return redirect(`/login?message=${error.message}`)
    }

    const { data: homeWorkspace, error: homeWorkspaceError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("user_id", data.user.id)
      .eq("is_home", true)
      .single()

    if (!homeWorkspace) {
      // If no home workspace exists (e.g., after database reset), redirect to setup
      console.log(
        "No home workspace found after login, redirecting to setup:",
        homeWorkspaceError?.message
      )
      return redirect("/setup")
    }

    return redirect(`/${homeWorkspace.id}/chat`)
  }

  const getEnvVarOrEdgeConfigValue = async (name: string) => {
    "use server"
    if (process.env.EDGE_CONFIG) {
      return await get<string>(name)
    }

    return process.env[name]
  }

  const signUp = async (formData: FormData) => {
    "use server"

    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const emailDomainWhitelistPatternsString = await getEnvVarOrEdgeConfigValue(
      "EMAIL_DOMAIN_WHITELIST"
    )
    const emailDomainWhitelist = emailDomainWhitelistPatternsString?.trim()
      ? emailDomainWhitelistPatternsString?.split(",")
      : []
    const emailWhitelistPatternsString =
      await getEnvVarOrEdgeConfigValue("EMAIL_WHITELIST")
    const emailWhitelist = emailWhitelistPatternsString?.trim()
      ? emailWhitelistPatternsString?.split(",")
      : []

    // If there are whitelist patterns, check if the email is allowed to sign up
    if (emailDomainWhitelist.length > 0 || emailWhitelist.length > 0) {
      const domainMatch = emailDomainWhitelist?.includes(email.split("@")[1])
      const emailMatch = emailWhitelist?.includes(email)
      if (!domainMatch && !emailMatch) {
        return redirect(
          `/login?message=Email ${email} is not allowed to sign up.`
        )
      }
    }

    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // USE IF YOU WANT TO SEND EMAIL VERIFICATION, ALSO CHANGE TOML FILE
        // emailRedirectTo: `${origin}/auth/callback`
      }
    })

    if (error) {
      console.error(error)
      return redirect(`/login?message=${error.message}`)
    }

    return redirect("/setup")

    // USE IF YOU WANT TO SEND EMAIL VERIFICATION, ALSO CHANGE TOML FILE
    // return redirect("/login?message=Check email to continue sign in process")
  }

  const handleResetPassword = async (formData: FormData) => {
    "use server"

    const origin = headers().get("origin")
    const email = formData.get("email") as string
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/login/password`
    })

    if (error) {
      return redirect(`/login?message=${error.message}`)
    }

    return redirect("/login?message=Check email to reset password")
  }

  return (
    <div className="bg-paper flex min-h-dvh w-full flex-col items-center justify-center p-6">
      <div className="border-line bg-surface w-full max-w-[400px] rounded-xl border p-8 shadow-sm">
        <div className="mb-7 flex justify-center">
          <Brand />
        </div>

        <form className="flex w-full flex-col gap-3.5" action={signIn}>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="email"
              className="text-ink text-[12.5px] font-medium"
            >
              Email
            </Label>
            <Input
              id="email"
              name="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="password"
              className="text-ink text-[12.5px] font-medium"
            >
              Password
            </Label>
            <Input
              id="password"
              type="password"
              name="password"
              placeholder="••••••••"
            />
          </div>

          <SubmitButton className="bg-rust text-paper border-rust mt-3 inline-flex h-10 items-center justify-center rounded-md border px-4 text-[14px] font-medium transition-colors hover:bg-[color:var(--rust-hover)]">
            Login
          </SubmitButton>

          <SubmitButton
            formAction={signUp}
            className="bg-surface text-ink hover:bg-paper-2 border-line hover:border-line-strong inline-flex h-10 items-center justify-center rounded-md border px-4 text-[14px] font-medium transition-colors"
          >
            Sign up
          </SubmitButton>

          <div className="text-ink-3 mt-2 flex justify-center text-[12.5px]">
            <span className="mr-1">Forgot your password?</span>
            <button
              formAction={handleResetPassword}
              className="text-rust ml-1 underline hover:opacity-80"
            >
              Reset
            </button>
          </div>

          <div className="text-ink-3 flex justify-center text-[12.5px]">
            <span className="mr-1">Having login issues?</span>
            <button
              formAction={clearCacheAndLogout}
              className="text-rust ml-1 underline hover:opacity-80"
            >
              Clear cache
            </button>
          </div>

          {searchParams?.message && (
            <p className="bg-paper-2 text-ink-2 border-line mt-3 rounded-md border p-3 text-center text-[12.5px]">
              {searchParams.message}
            </p>
          )}

          {supabaseConnectionError && (
            <p className="bg-rust-soft text-rust-ink border-rust-soft mt-3 rounded-md border p-3 text-center text-[12.5px]">
              {supabaseConnectionError}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
