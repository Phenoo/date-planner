import { Suspense } from "react";
import { DateAtlas } from "@/components/date-atlas/date-atlas";
import { publicCatalog } from "@/lib/seo/public-catalog";
import { indexableExperiences, publicMetadata } from "@/lib/seo/site";

export async function generateMetadata() {
  const experiences = indexableExperiences(await publicCatalog());
  return publicMetadata("Explore date experiences", "Browse published date experiences, compare estimated costs and find something that suits your time and interests.", "/explore", experiences.length > 0);
}

async function ExploreContent() {
  return <DateAtlas initialView="explore" initialCatalog={await publicCatalog()} />;
}
export default function Page() {
  return (
    <Suspense
      fallback={<main className="loading-state">A little moment…</main>}
    >
      <ExploreContent />
    </Suspense>
  );
}
