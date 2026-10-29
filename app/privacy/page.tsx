import Link from "next/link";

export default function PrivacyPage() {
  return <main className="page-container legal-page"><Link className="atlas-wordmark" href="/" aria-label="a date at las home">adal<span>.</span></Link><h1>Privacy policy</h1>
    <p>Your planning answers help a date at las find suitable experiences. Drafts and preferences can be stored on your device; saved plans and account data may also be stored in Firebase.</p>
    <p>Gender questions are optional. These answers provide context for personalization and are excluded from shared plan links and invitation details.</p>
    <p>When you choose “Use My Location,” your browser asks for permission. Coordinates are sent to our server and Google Geocoding to identify your neighborhood. a date at las does not save your precise device coordinates. You can choose an area manually instead.</p>
    <p>Selected areas and relevant place types are sent to Google Maps and Places for nearby suggestions. Place details are retrieved live. Planning preferences may be sent to DeepSeek for personalization; exact device coordinates are not included in that request.</p>
    <p>Google Maps features are subject to the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>. Share links omit personal interests, dislikes and notes.</p>
    <p>You can remove device saves and preferences in My plans and Profile. Use Help &amp; support for questions about stored account information.</p><Link href="/terms">Terms of use</Link>
  </main>;
}
