import Link from "next/link";

export default function TermsPage() {
  return <main className="page-container legal-page"><Link className="atlas-wordmark" href="/" aria-label="a date at las home">adal<span>.</span></Link><h1>Terms of use</h1>
    <p>a date at las provides date planning assistance and nearby place suggestions. Confirm costs, operating hours, dietary requirements, accessibility and availability directly with each venue before visiting.</p>
    <p>Google Places suggestions identify real listings, but are not reservations or guarantees of suitability or affordability. Only approved, priced catalog experiences can be included in a budgeted itinerary. Fictional development records are labeled demo.</p>
    <p>Use of Google Maps features is also subject to the <a href="https://www.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps/Google Earth Additional Terms of Service</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p>
    <p>Travel distances and costs are estimates unless explicitly stated otherwise. No reservation is confirmed until the venue or booking provider confirms it.</p><Link href="/privacy">Privacy policy</Link>
  </main>;
}
