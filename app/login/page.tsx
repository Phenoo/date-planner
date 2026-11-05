import { Suspense } from "react";
import { SavedDatesLogin } from "@/components/date-atlas/saved-dates-access";
import { privateMetadata } from "@/lib/seo/site";

export const metadata = privateMetadata("Sign in");

export default function LoginPage() {
  return <Suspense fallback={<main className="loading-state" role="status">Opening sign-in…</main>}>
    <SavedDatesLogin />
  </Suspense>;
}
