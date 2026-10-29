import { Suspense } from "react";
import { RecommendationLab } from "@/components/date-atlas/recommendation-lab";
export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="loading-state">Opening the recommendation lab…</main>
      }
    >
      <RecommendationLab />
    </Suspense>
  );
}
