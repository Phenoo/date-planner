import { Suspense } from "react";
import { DateAtlas } from "@/components/date-atlas/date-atlas";
async function Experience({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DateAtlas initialView="experience" experienceId={id} />;
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
