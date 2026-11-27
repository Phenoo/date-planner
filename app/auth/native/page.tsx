import { Suspense } from "react";
import { NativeGoogleSignIn } from "@/components/date-atlas/native-google-sign-in";
import { privateMetadata } from "@/lib/seo/site";

export const metadata = privateMetadata("Continue with Google");

export default function Page() {
  return <Suspense fallback={<main className="loading-state">Opening Google sign-in…</main>}><NativeGoogleSignIn /></Suspense>;
}
