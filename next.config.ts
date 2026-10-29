import type { NextConfig } from "next";

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
};

export default nextConfig;
