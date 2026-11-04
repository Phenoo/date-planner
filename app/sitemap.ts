import type { MetadataRoute } from "next";
import { publicCatalog } from "@/lib/seo/public-catalog";
import { indexableExperiences, siteOrigin } from "@/lib/seo/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const experiences = indexableExperiences(await publicCatalog());
  return [
    ...["/", "/date-ideas", "/privacy", "/terms", ...(experiences.length ? ["/explore"] : [])].map((path) => ({ url: new URL(path, siteOrigin).href })),
    ...experiences.map((experience) => ({ url: `${siteOrigin}/experiences/${encodeURIComponent(experience.id)}` })),
  ];
}
