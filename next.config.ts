import type { NextConfig } from "next";

const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "*.ggpht.com", pathname: "/**" },
      ...(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? [
          {
            protocol: "https" as const,
            hostname: "firebasestorage.googleapis.com",
            port: "",
            pathname: `/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app/o/**`,
          },
        ] : []),
    ],
    maximumRedirects: 0,
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    if (!firebaseProjectId || !/^[a-z0-9-]+$/.test(firebaseProjectId)) return [];
    // Firebase's OAuth helper must run on the app domain so the popup can return to its opener.
    return [{ source: "/__/auth/:path*", destination: `https://${firebaseProjectId}.firebaseapp.com/__/auth/:path*` }];
  },
  async headers() {
    return [{ source: "/auth/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
    ] }, { source: "/__/auth/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
      { key: "x-vercel-enable-rewrite-caching", value: "0" },
    ] }, ...["/api/:path*", "/invite/:path*", "/wishlist/:path*", "/plan", "/saved", "/profile", "/favorites", "/admin", "/membership"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, nosnippet" }],
    }))];
  },
};

export default nextConfig;
