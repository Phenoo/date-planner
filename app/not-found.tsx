import Link from "next/link";

export default function NotFound() {
  return <main className="empty-state page-container"><span className="eyebrow">A LITTLE DETOUR</span><h1>That page isn’t here.</h1><p>The link may have changed, or the experience may no longer be available.</p><Link className="text-link" href="/date-ideas">Find a little date inspiration ↗</Link><Link className="text-link" href="/">Back to a date at las ↗</Link></main>;
}
