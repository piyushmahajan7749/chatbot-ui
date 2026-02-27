const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
})

const withPWA = require("next-pwa")({
  dest: "public"
})

module.exports = withBundleAnalyzer(
  withPWA({
    reactStrictMode: true,
    images: {
      remotePatterns: [
        {
          protocol: "http",
          hostname: "localhost"
        },
        {
          protocol: "http",
          hostname: "127.0.0.1"
        },
        {
          protocol: "https",
          hostname: "**"
        }
      ]
    },
    experimental: {
      serverComponentsExternalPackages: [
        "sharp",
        "onnxruntime-node",
        "@napi-rs/canvas"
      ]
    },
    async rewrites() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      // Proxy browser Supabase requests through our domain to bypass ISP blocking
      // Only add rewrites when SUPABASE_URL is an absolute URL (not already a proxy path)
      if (!supabaseUrl || supabaseUrl.startsWith("/")) return []
      return [
        {
          source: "/supabase-proxy/:path*",
          destination: `${supabaseUrl}/:path*`
        }
      ]
    }
  })
)
