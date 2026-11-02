import type { NearbyResult } from "@/lib/maps/schema";
import styles from "./venue-details.module.css";

type Place = NearbyResult["places"][number];
type Review = NonNullable<Place["details"]>["reviews"][number];

export function ReviewArticle({ review }: { review: Review }) {
  return <article><div><strong>{review.url ? <a href={review.url} target="_blank" rel="noreferrer">{review.author} ↗</a> : review.author}</strong><span>{review.rating !== undefined ? `${review.rating} / 5` : ""} {review.when ? `· ${review.when}` : ""}</span></div><p>{review.text.length > 340 ? `${review.text.slice(0, 300).trimEnd()}…` : review.text}</p>{review.text.length > 340 && <details><summary>Read full review</summary><p>{review.text}</p></details>}</article>;
}

export function VenueReview({ place }: { place: Place }) {
  const review = place.details?.reviews.find((item) => item.text.trim());
  if (!review) return null;
  return <section className={`${styles.details} ${styles.inverted} ${styles.preview}`} aria-label={`A Google Maps review of ${place.name}`}>
    <div className={styles.reviews}><h3>A word from a visitor.</h3><ReviewArticle review={review} /><a href={place.mapsUrl} target="_blank" rel="noreferrer">Reviews on Google Maps ↗</a></div>
  </section>;
}
