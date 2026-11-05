import Link from "next/link";
import { PartnershipForm } from "@/components/date-atlas/partnership-form";
import { publicMetadata, siteName, supportEmail } from "@/lib/seo/site";
import styles from "@/components/seo/company-pages.module.css";

export const metadata = publicMetadata(
  "Partnerships",
  "Discuss venue, experience and brand partnerships with A Date At las. Share your organisation, location and proposal through our partnership enquiry form.",
  "/partners",
);

export default function PartnersPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.wordmark} aria-label={`${siteName} home`}>adal<span>.</span></Link>
      <nav className={styles.nav} aria-label="Main navigation"><Link href="/">Home</Link><Link href="/plan">Plan a date</Link></nav>
    </header>
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="partnership-heading">
        <span className={styles.eyebrow}>Partnership enquiries</span>
        <h1 id="partnership-heading">Partner with A Date At las.</h1>
        <p className={styles.lead}>Good dates begin with good places and experiences. Tell us what you offer, who it is for and how we could work together.</p>
        <div className={styles.links}><a href="#partnership-enquiry" className={styles.primary}>Share a proposal</a><Link href="/about">About A Date At las</Link></div>
      </section>

      <section className={styles.section} aria-labelledby="partnership-types">
        <h2 id="partnership-types">A place for considered collaborations.</h2>
        <div className={styles.partnershipTypes}>
          <article className={styles.typeCard}><span aria-hidden="true">01</span><h3>Venues</h3><p>Restaurants, cafés and destinations that make time together feel special. Share your location, visitor information and what makes your place worth discovering.</p></article>
          <article className={styles.typeCard}><span aria-hidden="true">02</span><h3>Experiences</h3><p>Classes, activities and hosted experiences with a clear offer. Tell us about availability, pricing, booking and the people your experience is designed for.</p></article>
          <article className={styles.typeCard}><span aria-hidden="true">03</span><h3>Brands &amp; collaborators</h3><p>Relevant brands and teams with a concrete idea for helping people plan time together. Explain the proposed collaboration and what each side would contribute.</p></article>
        </div>
        <p className={styles.body}>An enquiry starts a conversation. It does not guarantee a listing, recommendation or commercial agreement. Recommendations still need to meet our venue quality requirements.</p>
      </section>

      <section id="partnership-enquiry" className={styles.formSection} aria-labelledby="enquiry-heading">
        <div className={styles.formIntro}>
          <span className={styles.eyebrow}>Start a conversation</span>
          <h2 id="enquiry-heading">Tell us about your proposal.</h2>
          <p>Give us the practical details: what you offer, where you operate and the partnership you have in mind. Include a public website if you have one.</p>
          <p>For help with an existing date plan or your account, contact support.</p>
          <a className={styles.contactLink} href={`mailto:${supportEmail}`}>{supportEmail}</a>
        </div>
        <PartnershipForm />
      </section>
    </main>
    <footer className={styles.footer}>
      <Link href="/">{siteName}</Link>
      <nav className={styles.footerNav} aria-label="Footer"><Link href="/about">About</Link><Link href="/partners" aria-current="page">Partners</Link><a href={`mailto:${supportEmail}`}>Support</a><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
    </footer>
  </div>;
}
