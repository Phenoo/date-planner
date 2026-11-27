"use client";

import Image from "next/image";
import Link from "next/link";
import { AtlasIcon } from "./atlas-icon";
import { NativePlusCard } from "./native-app-ui";
import { useNativeWishlist } from "./use-native-wishlist";
import styles from "./native-app.module.css";

export function NativeUsSummary({ ownerId, accountName, onAuth, onPlus }: { ownerId: string | null; accountName?: string | null; onAuth: () => void; onPlus: () => void }) {
  const wishlist = useNativeWishlist(ownerId);
  return <section className={styles.usHub}>
    <div className={styles.usIntro}><span><AtlasIcon name="us-rings" size={36} /></span><h1>You &amp; your person</h1><p>{accountName ? `${accountName}, make time for your kind of together.` : "Good ideas. Shared plans. More time together."}</p></div>
    <Link href="/wishlist" className={styles.usCover}><Image src="/images/together.jpg" alt="" fill sizes="(max-width: 720px) 100vw, 640px" /><span><strong>All the things we’ll do.</strong><small>Your ideas. One shared little list.</small></span></Link>
    <section className={styles.usCollection}>
      <div className={styles.usHeading}><h2>Our wishlist</h2><Link href="/wishlist">See all<AtlasIcon name="arrow-right" size={15} /></Link></div>
      {wishlist.loading ? <p role="status">Loading your saved places…</p> : wishlist.list?.entries.length ? <div className={styles.wishlistPreview}>{wishlist.list.entries.slice(0, 3).map(entry => <Link href="/wishlist" key={entry.placeId}><span><AtlasIcon name="heart-tag" size={23} /></span><strong>{entry.place?.name ?? "Saved place"}</strong><small>{entry.city}</small></Link>)}</div> : <Link className={styles.usRow} href="/wishlist"><AtlasIcon name="heart-tag" size={25} /><span><strong>Build a list together</strong><small>Save places you’d love to try.</small></span><AtlasIcon name="chevron-right" size={17} /></Link>}
      {wishlist.error && <p role="alert">{wishlist.error}</p>}
    </section>
    <Link href="/saved" className={styles.usRow}><AtlasIcon name="date-book" size={25} /><span><strong>Our dates</strong><small>Plans, invitations and memories.</small></span><AtlasIcon name="chevron-right" size={17} /></Link>
    <NativePlusCard onOpen={onPlus} />
    <button type="button" className={styles.usRow} onClick={onAuth}><AtlasIcon name="user-round" size={25} /><span><strong>{ownerId ? "Your account" : "Keep your dates with you"}</strong><small>{ownerId ? "Account details and privacy controls." : "Sign in when you’re ready to save across devices."}</small></span><AtlasIcon name="chevron-right" size={17} /></button>
  </section>;
}
