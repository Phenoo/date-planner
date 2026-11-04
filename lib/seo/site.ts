import type { Metadata } from "next";
import type { Experience } from "@/lib/planner/schema";

export const siteName = "a date at las";
export const siteOrigin = "https://date-atlas.vercel.app";
export const siteDescription = "Find thoughtful date ideas and plan a date around your city, budget, time and interests. Chat or speak with Oge, your AI date-planning companion.";

export function publicMetadata(title: string, description: string, path: string, index = true): Metadata {
  const url = new URL(path, siteOrigin).href;
  const canIndex = index && process.env.VERCEL_ENV !== "preview" && process.env.VERCEL_ENV !== "development";
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: canIndex, follow: true },
    openGraph: { type: "website", siteName, title: `${title} | ${siteName}`, description, url, locale: "en_US", images: [{ url: `${siteOrigin}/opengraph-image`, width: 1200, height: 630, alt: "adal. — A little thought. A lovely date." }] },
    twitter: { card: "summary_large_image", title: `${title} | ${siteName}`, description, images: [`${siteOrigin}/opengraph-image`] },
  };
}

export function privateMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: false, nocache: true } };
}

export function indexableExperiences(experiences: readonly Experience[]) {
  return experiences.filter((experience) => experience.active && experience.approved && !experience.demo && !!experience.verifiedAt && !!experience.sourceUrl);
}

export function serializeJsonLd(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export const websiteGraph = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${siteOrigin}/#organization`, name: siteName, alternateName: "adal", url: siteOrigin, logo: `${siteOrigin}/icon.svg` },
    { "@type": "WebSite", "@id": `${siteOrigin}/#website`, name: siteName, alternateName: "adal", url: siteOrigin, description: siteDescription, inLanguage: "en", publisher: { "@id": `${siteOrigin}/#organization` } },
  ],
};
