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
  const i18nResult = i18nRouter(request, i18nConfig)
  if (i18nResult) return i18nResult

  try {
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

    // Unauthenticated.
    if (target.kind === "path" && target.path === "/login") {
      if (isLogin || isRoot) return response
      return redirectWith(request, "/login", response)
    }

    // Signup trigger hasn't completed — only onboarding may render (shows a fallback).
    if (target.kind === "profile_pending") {
      if (isOnboarding) return response
      return redirectWith(request, "/onboarding", response)
    }

    if (target.kind !== "path") return response
    const targetPath = target.path

    // Logged-in user on marketing/login pages — send to their destination.
    if (isLogin || isRoot) {
      return redirectWith(request, targetPath, response)
    }

    // Not onboarded — must be on /onboarding.
    if (targetPath === "/onboarding") {
      if (isOnboarding) return response
      return redirectWith(request, "/onboarding", response)
    }

    // Already onboarded — bounce away from /onboarding to home.
    if (isOnboarding) {
      return redirectWith(request, targetPath, response)
    }

    return response
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
