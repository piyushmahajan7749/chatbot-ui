import { getRedirectTarget } from "@/lib/auth/get-redirect-target"
import { createClient } from "@/lib/supabase/middleware"
import { i18nRouter } from "next-i18n-router"
import { NextResponse, type NextRequest } from "next/server"
import i18nConfig from "./i18nConfig"

function stripLocale(pathname: string, locales: string[]): string {
  const segments = pathname.split("/")
  if (segments.length > 1 && locales.includes(segments[1])) {
    return "/" + segments.slice(2).join("/")
  }
  return pathname
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

    // Unauthenticated.
    if (target.kind === "path" && target.path === "/login") {
      if (isLogin || isRoot) return response
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Signup trigger hasn't completed — only onboarding may render (shows a fallback).
    if (target.kind === "profile_pending") {
      if (isOnboarding) return response
      return NextResponse.redirect(new URL("/onboarding", request.url))
    }

    if (target.kind !== "path") return response
    const targetPath = target.path

    // Logged-in user on marketing/login pages — send to their destination.
    if (isLogin || isRoot) {
      return NextResponse.redirect(new URL(targetPath, request.url))
    }

    // Not onboarded — must be on /onboarding.
    if (targetPath === "/onboarding") {
      if (isOnboarding) return response
      return NextResponse.redirect(new URL("/onboarding", request.url))
    }

    // Already onboarded — bounce away from /onboarding to home.
    if (isOnboarding) {
      return NextResponse.redirect(new URL(targetPath, request.url))
    }

    return response
  } catch (e) {
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
