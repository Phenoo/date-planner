import { Suspense } from "react";
import { DateAtlas } from "@/components/date-atlas/date-atlas";
import { notFound } from "next/navigation";
import { publicCatalog } from "@/lib/seo/public-catalog";
import { indexableExperiences, publicMetadata, siteOrigin } from "@/lib/seo/site";
import { JsonLd } from "@/components/seo/json-ld";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const experience = (await publicCatalog()).find((item) => item.id === id);
  if (!experience) notFound();
  return publicMetadata(`${experience.name} in ${experience.city}`, experience.description, `/experiences/${encodeURIComponent(id)}`, indexableExperiences([experience]).length > 0);
}
async function Experience({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catalog = await publicCatalog();
  const experience = catalog.find((item) => item.id === id);
  if (!experience) notFound();
  return <><JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin },
    { "@type": "ListItem", position: 2, name: "Experiences", item: `${siteOrigin}/explore` },
    { "@type": "ListItem", position: 3, name: experience.name, item: `${siteOrigin}/experiences/${encodeURIComponent(id)}` },
  ] }} /><DateAtlas key={id} initialView="experience" experienceId={id} initialCatalog={catalog} /></>;
}
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={<main className="loading-state">Finding your experience…</main>}
    >
      <Experience params={params} />
    </Suspense>
  );
}
