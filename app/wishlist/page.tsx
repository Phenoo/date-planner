import { SharedWishlist } from "@/components/date-atlas/shared-wishlist";
import { privateMetadata } from "@/lib/seo/site";

export const metadata = { ...privateMetadata("Shared wishlist"), referrer: "no-referrer" } as const;

export default function Page() {
  return <SharedWishlist />;
}
