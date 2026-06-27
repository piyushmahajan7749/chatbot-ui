import { Analytics } from "@vercel/analytics/react"
import { Toaster } from "@/components/ui/sonner"
import { GlobalState } from "@/components/utility/global-state"
import { Providers } from "@/components/utility/providers"
import TranslationsProvider from "@/components/utility/translations-provider"
import initTranslations from "@/lib/i18n"
import { Database } from "@/supabase/types"
import { createServerClient } from "@supabase/ssr"
import { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { cookies } from "next/headers"
import { ReactNode } from "react"
import "./globals.css"

// Fonts bundled locally (under `app/fonts/`) instead of being fetched
// from Google Fonts at render time. The Google path was looping through
// proxy redirects on some dev networks and exhausting undici's 20-hop
// redirect cap (`redirect count exceeded`), which crashed every RSC
// render. Local files = offline-resilient + no external network call.
// woff2 sourced from @fontsource(-variable) packages (OFL licensed).
const interTight = localFont({
  src: "../fonts/inter-tight-variable.woff2",
  // Variable font spanning weights 100-900 - we only use 400/500/600.
  weight: "100 900",
  display: "swap",
  variable: "--font-inter-tight"
})
const ibmPlexSans = localFont({
  src: [
    {
      path: "../fonts/ibm-plex-sans-400.woff2",
      weight: "400",
      style: "normal"
    },
    {
      path: "../fonts/ibm-plex-sans-500.woff2",
      weight: "500",
      style: "normal"
    },
    { path: "../fonts/ibm-plex-sans-600.woff2", weight: "600", style: "normal" }
  ],
  display: "swap",
  variable: "--font-ibm-plex-sans"
})
const ibmPlexMono = localFont({
  src: [
    {
      path: "../fonts/ibm-plex-mono-400.woff2",
      weight: "400",
      style: "normal"
    },
    { path: "../fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" }
  ],
  display: "swap",
  variable: "--font-ibm-plex-mono"
})
const APP_NAME = "Shadow AI"
const APP_DEFAULT_TITLE = "Shadow AI"
const APP_TITLE_TEMPLATE = "%s - Shadow AI"
const APP_DESCRIPTION = "Tools for research scientists!"

interface RootLayoutProps {
  children: ReactNode
  params: {
    locale: string
  }
}

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  // Old favicon.ico + icon-{192,256,512} PNGs were deleted with the
  // rebrand. The new logo PNG (500x500) doubles as favicon / apple
  // touch icon - modern browsers accept PNG for both. The full lockup
  // (logo-full.png) is used for OG / Twitter share cards.
  icons: {
    icon: [{ url: "/logo.png", sizes: "500x500", type: "image/png" }],
    shortcut: [{ url: "/logo.png" }],
    apple: [{ url: "/logo.png", sizes: "500x500", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: APP_DEFAULT_TITLE
    // startUpImage: [],
  },
  formatDetection: {
    telephone: false
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE
    },
    description: APP_DESCRIPTION,
    images: [{ url: "/logo-full.png", width: 520, height: 335 }]
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE
    },
    description: APP_DESCRIPTION,
    images: ["/logo-full.png"]
  }
}

export const viewport: Viewport = {
  // Logo navy - matches the helix logo background so the address bar /
  // PWA chrome read as part of the brand mark.
  themeColor: "#0E0B40"
}

const i18nNamespaces = ["translation"]

export default async function RootLayout({
  children,
  params: { locale }
}: RootLayoutProps) {
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
  // If Supabase is unreachable (e.g. local stack not running), don't crash the whole app.
  let session: Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >["data"]["session"] = null
  try {
    session = (await supabase.auth.getSession()).data.session
  } catch (e) {
    session = null
  }

  const { t, resources } = await initTranslations(locale, i18nNamespaces)

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interTight.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="font-sans">
        <Providers attribute="class" defaultTheme="dark">
          <TranslationsProvider
            namespaces={i18nNamespaces}
            locale={locale}
            resources={resources}
          >
            <Toaster richColors position="top-center" duration={3000} />
            <div className="bg-background text-foreground flex h-dvh w-full flex-col overflow-x-auto">
              {session ? <GlobalState>{children}</GlobalState> : children}
            </div>
          </TranslationsProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
