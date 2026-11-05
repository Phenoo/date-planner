import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { publicMetadata, siteOrigin, supportEmail } from "@/lib/seo/site";
import styles from "@/components/seo/company-pages.module.css";

const description = "Learn how A Date At las helps you plan a personal date, choose a place, check the practical details and share an invitation with someone you care about.";

export const metadata = publicMetadata("About Us", description, "/about");

export default function AboutPage() {
  return <div className={styles.page}>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "AboutPage", name: "About A Date At las", description, url: `${siteOrigin}/about` }} />
    <header className={styles.header}>
      <Link className={styles.wordmark} href="/" aria-label="A Date At las home">adal<span>.</span></Link>
      <nav className={styles.nav} aria-label="Main navigation"><Link href="/">Home</Link><Link className={styles.primary} href="/plan">Plan a date</Link></nav>
    </header>
    <main className={styles.main}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>ABOUT A DATE AT LAS</span>
        <h1>A thoughtful date starts with you.</h1>
        <p className={styles.lead}>A Date At las helps turn an idea into a place, a time and an invitation. You bring the people and the preferences. We help you work through the details.</p>
      </div>

      <section className={styles.section} aria-labelledby="our-purpose">
        <h2 id="our-purpose">Less arranging. More looking forward to it.</h2>
        <p>Choosing a date can involve more decisions than you expect: where to go, what you would both enjoy, how far to travel and what feels comfortable to spend. Our purpose is to make those decisions easier to work through together.</p>
        <p>A Date At las is for first dates, familiar favourites, anniversaries and ordinary days that deserve a little attention. You do not need an elaborate idea or a special occasion. A sense of what you would enjoy is enough to begin.</p>
      </section>

      <section className={styles.section} aria-labelledby="planning-your-way">
        <h2 id="planning-your-way">Plan in the way that suits you.</h2>
        <p>Follow the step-by-step questions, or talk things through with Oge, the planning assistant. In chat, you can describe several preferences at once and correct individual details as you go. The aim is to build on what you have already shared.</p>
        <p>Where your browser supports voice input, you can speak instead of typing. Review the transcript before sending it. Location access is optional too: use your browser’s location feature, or enter a city and neighbourhood yourself. You choose the day and exact starting time.</p>
      </section>

      <section className={styles.section} aria-labelledby="your-preferences">
        <h2 id="your-preferences">Start with what matters to you.</h2>
        <p>The occasion, number of people, preferred atmosphere, interests and travel reach help shape the search. You can choose an indoor or outdoor preference, ask for somewhere quieter, specify a step-free entrance or name activities to avoid.</p>
        <p>Set a total or per-person spending ceiling in your chosen currency, or leave the budget open. A spending limit guides planning; it does not turn an unknown venue price into a confirmed cost.</p>
      </section>

      <section className={styles.section} aria-labelledby="choosing-places">
        <h2 id="choosing-places">How places are chosen.</h2>
        <p>Live suggestions use Google Maps venue information alongside your preferences. New recommendations require a confirmed Google average rating strictly above 3.75 out of 5. Places with a missing rating or a rating of 3.75 or below are excluded. This is the venue’s aggregate rating, not a selected individual review.</p>
        <p>That threshold is one check, not a guarantee of your experience. We also use available location, opening-hours and other venue information. Source-reviewed catalog experiences can support plans where available. Coverage and the detail available vary by destination; if a suitable place cannot be confirmed, the app asks you to reconsider the search.</p>
      </section>

      <section className={styles.section} aria-labelledby="before-you-go">
        <h2 id="before-you-go">The details still worth checking.</h2>
        <p>Public listings can be incomplete or change after a recommendation. Missing information remains unconfirmed. Before you commit, check these points directly with the venue:</p>
        <ul className={styles.list}>
          <li>Current prices, what they include and any additional charges.</li>
          <li>Opening hours for your chosen day and any booking requirements.</li>
          <li>Essential dietary, access or other requirements.</li>
          <li>Travel arrangements and whether the setting suits your plans.</li>
        </ul>
        <p>A recommendation is not a reservation. A Date At las does not book the venue or collect its booking payment. Any reservation and payment arrangements are made separately with the venue or its booking provider.</p>
      </section>

      <section className={styles.section} aria-labelledby="save-and-invite">
        <h2 id="save-and-invite">Keep the plan. Share the invitation.</h2>
        <p>Sign in or create an account to save a chosen date and return to it in My dates. When you are ready, create an invitation link with the place, day, time and a suggested date story. Add a personal note if you would like.</p>
        <p>The recipient can open the link and respond. Anyone with that link can see its public contents, so share it deliberately. You can revoke an invitation while keeping your private saved date. Suggested moments are ideas for your time together, not confirmed venue services or events.</p>
      </section>

      <section className={styles.section} aria-labelledby="privacy-and-control">
        <h2 id="privacy-and-control">Your preferences deserve care.</h2>
        <p>Share only the information needed to shape your plan. Public invitations leave out private planning answers, budgets and account details. A personal note added to an invitation is deliberately public to anyone with its link.</p>
        <p>You can edit saved preferences, manage your dates and request account deletion through the account controls. Our <Link href="/privacy">privacy policy</Link> explains the information used by the app, its planning providers and available controls. The <Link href="/terms">terms</Link> explain how recommendations and venue information should be used.</p>
      </section>

      <section className={styles.section} aria-labelledby="work-with-us">
        <h2 id="work-with-us">Have a question or a place to share?</h2>
        <p>For help with the app or a venue detail that needs attention, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Include the relevant place or page and what happened, without sending passwords or sign-in links.</p>
        <p>If you run a venue or experience, visit <Link href="/partners">Partner with us</Link> to share current prices, opening hours, location and source information. Submitting information does not guarantee a listing or recommendation.</p>
        <div className={styles.links}><Link className={styles.primary} href="/plan">Plan your date</Link><a href={`mailto:${supportEmail}`}>Get help</a></div>
      </section>
    </main>
    <footer className={styles.footer}>
      <Link className={styles.wordmark} href="/">A Date At las</Link>
      <nav className={styles.footerNav} aria-label="Footer"><Link href="/about" aria-current="page">About</Link><Link href="/partners">Partners</Link><a href={`mailto:${supportEmail}`}>Support</a><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
    </footer>
  </div>;
}
