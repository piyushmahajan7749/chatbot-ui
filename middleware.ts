import { getRedirectTarget } from "@/lib/auth/get-redirect-target"
import { createClient } from "@/lib/supabase/middleware"
import { i18nRouter } from "next-i18n-router"
import { NextResponse, type NextRequest } from "next/server"
import i18nConfig from "./i18nConfig"

const DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1"

function stripLocale(pathname: string, locales: string[]): string {
  const segments = pathname.split("/")
  if (segments.length > 1 && locales.includes(segments[1])) {
    return "/" + segments.slice(2).join("/")
  }
  return pathname
}

// Supabase's SSR client sets refreshed auth cookies on the `response` object
// we captured from createClient(). Building a fresh NextResponse for a redirect
// discards those cookies and loops the user through refresh on every request.
// Copy them over before returning the redirect.
function redirectWith(
  request: NextRequest,
  path: string,
  response: NextResponse
): NextResponse {
  const redirect = NextResponse.redirect(new URL(path, request.url))
  response.cookies.getAll().forEach(cookie => {
    redirect.cookies.set(cookie)
  })
  return redirect
}

export async function middleware(request: NextRequest) {
  try {
    // Auth gate runs FIRST. i18nRouter always returns a response (a rewrite
    // for the default locale, a redirect for others) — letting it run first
    // would short-circuit middleware before we ever read the session cookie,
    // so logged-in users get stuck on the marketing page at /.
    const { supabase, response } = createClient(request)
    const pathname = stripLocale(request.nextUrl.pathname, i18nConfig.locales)

    const isRoot = pathname === "/" || pathname === ""
    const isLogin = pathname === "/login" || pathname.startsWith("/login/")
    const isOnboarding = pathname === "/onboarding"

    const target = await getRedirectTarget(supabase)

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log("[mw]", {
        pathname,
        isRoot,
        isLogin,
        isOnboarding,
        target
      })
    }

    let redirectResponse: NextResponse | null = null

    if (target.kind === "path" && target.path === "/login") {
      // Unauthenticated.
      if (!isLogin && !isRoot) {
        redirectResponse = redirectWith(request, "/login", response)
      }
    } else if (target.kind === "profile_pending") {
      // Signup trigger hasn't completed — only onboarding may render.
      if (!isOnboarding) {
        redirectResponse = redirectWith(request, "/onboarding", response)
      }
    } else if (target.kind === "path") {
      const targetPath = target.path
      if (isLogin || isRoot) {
        // Logged-in user on marketing/login pages — send to their destination.
        redirectResponse = redirectWith(request, targetPath, response)
      } else if (targetPath === "/onboarding" && !isOnboarding) {
        // Not onboarded — must be on /onboarding.
        redirectResponse = redirectWith(request, "/onboarding", response)
      } else if (isOnboarding) {
        // Already onboarded — bounce away from /onboarding to home.
        redirectResponse = redirectWith(request, targetPath, response)
      }
    }

    if (redirectResponse) return redirectResponse

    // No auth redirect needed — hand off to i18nRouter for the locale rewrite.
    // Propagate any refreshed Supabase cookies onto its response so the browser
    // sees them on the way back.
    const i18nResult = i18nRouter(request, i18nConfig)
    response.cookies.getAll().forEach(cookie => {
      i18nResult.cookies.set(cookie)
    })
    return i18nResult
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[mw] error:", e)
    return NextResponse.next({
      request: {
        headers: request.headers
      }
    })
  }
}

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next|auth|supabase-proxy).*)"
}
