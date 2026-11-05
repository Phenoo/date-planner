import { ImageResponse } from "next/og";
import { siteName, siteOrigin } from "@/lib/seo/site";

export const alt = `${siteName} — A little thought. A lovely date.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "#d91335", color: "white", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 64, fontWeight: 700, letterSpacing: -4 }}>adal.</span><span style={{ fontSize: 20, letterSpacing: 3 }}>A DATE AT LAS</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><span style={{ fontSize: 78, fontWeight: 700, letterSpacing: -4 }}>A little thought.</span><span style={{ fontSize: 78, fontWeight: 700, letterSpacing: -4 }}>A lovely date.</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 23 }}><span>Your city. Your vibe. Your budget.</span><span>{new URL(siteOrigin).hostname}</span></div>
    </div>,
    size,
  );
}
