import { HomeEntry, HomeEntryFallback } from "@/components/date-atlas/home-entry";
import { Suspense } from "react";
import { JsonLd } from "@/components/seo/json-ld";
import { publicMetadata, siteDescription, websiteGraph } from "@/lib/seo/site";

export const metadata = publicMetadata("Date Ideas & AI Date Planner", siteDescription, "/");

export default function Home() {
  return (
    <><JsonLd data={websiteGraph} /><Suspense fallback={<HomeEntryFallback />}>
      <HomeEntry />
    </Suspense></>
  );
}
