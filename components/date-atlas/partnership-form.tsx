"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { supportEmail } from "@/lib/seo/site";
import styles from "@/components/seo/company-pages.module.css";

type SubmissionState = { status: "idle" | "submitting" | "success" } | { status: "error"; message: string };

export function PartnershipForm() {
  const [state, setState] = useState<SubmissionState>({ status: "idle" });
  const active = useRef<AbortController | null>(null);
  const submissionKey = useRef<string | null>(null);
  const success = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (state.status === "success") success.current?.focus(); }, [state.status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const entry = form.get(name);
      return typeof entry === "string" ? entry.trim() : "";
    };
    const controller = new AbortController();
    active.current = controller;
    setState({ status: "submitting" });
    try {
      submissionKey.current ??= crypto.randomUUID();
      const response = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submissionKey.current },
        body: JSON.stringify({
          contactName: value("contactName"), workEmail: value("workEmail"), organization: value("organization"),
          role: value("role") || undefined, partnershipType: value("partnershipType"), cityCountry: value("cityCountry"),
          website: value("website") || undefined, proposal: value("proposal"),
          privacyAcknowledgement: form.get("privacyAcknowledgement") === "on", honeypot: value("honeypot"),
        }),
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "We couldn’t submit your proposal. Please try again.";
        if (!controller.signal.aborted) setState({ status: "error", message });
        return;
      }
      if (typeof result !== "object" || result === null || !("accepted" in result) || result.accepted !== true) {
        if (!controller.signal.aborted) setState({ status: "error", message: "Your submission hasn’t been confirmed. Please try again." });
        return;
      }
      submissionKey.current = null;
      if (!controller.signal.aborted) setState({ status: "success" });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error", message: "We couldn’t connect. Check your connection and try again." });
    } finally {
      if (active.current === controller) active.current = null;
    }
  }

  if (state.status === "success") return <div ref={success} className={styles.success} role="status" tabIndex={-1}>
    <h3>Your proposal has been received.</h3>
    <p>Thank you for introducing your organisation. Any follow-up will go to the email address you provided.</p>
    <p>Need to add something? Email <a className={styles.contactLink} href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
  </div>;

  const busy = state.status === "submitting";
  return <form className={styles.form} onSubmit={(event) => void submit(event)} aria-label="Partnership enquiry" aria-busy={busy}>
    <p className={styles.requiredNote}>Fields marked * are required.</p>
    <fieldset disabled={busy}>
      <legend className={styles.honeypot}>Your contact details and proposal</legend>
      <div className={styles.formGrid}>
        <div className={styles.field}><label htmlFor="partner-name">Full name *</label><input id="partner-name" name="contactName" autoComplete="name" required minLength={2} maxLength={120} /></div>
        <div className={styles.field}><label htmlFor="partner-email">Work email *</label><input id="partner-email" name="workEmail" type="email" autoComplete="email" required maxLength={254} /></div>
        <div className={styles.field}><label htmlFor="partner-organisation">Organisation *</label><input id="partner-organisation" name="organization" autoComplete="organization" required minLength={2} maxLength={160} /></div>
        <div className={styles.field}><label htmlFor="partner-role">Your role <span>(optional)</span></label><input id="partner-role" name="role" autoComplete="organization-title" maxLength={120} /></div>
        <div className={styles.field}><label htmlFor="partner-type">Partnership type *</label><select id="partner-type" name="partnershipType" required defaultValue=""><option value="" disabled>Select a partnership type</option><option value="venue">Venue</option><option value="experience">Experience</option><option value="brand">Brand collaboration</option><option value="other">Other</option></select></div>
        <div className={styles.field}><label htmlFor="partner-location">City and country *</label><input id="partner-location" name="cityCountry" required minLength={2} maxLength={160} placeholder="e.g. Lagos, Nigeria" /></div>
        <div className={`${styles.field} ${styles.fullWidth}`}><label htmlFor="partner-website">Website <span>(optional)</span></label><input id="partner-website" name="website" type="url" autoComplete="url" maxLength={2048} placeholder="https://" aria-describedby="partner-website-help" /><p id="partner-website-help" className={styles.helper}>A public website or business profile where we can learn about your work.</p></div>
        <div className={`${styles.field} ${styles.fullWidth}`}><label htmlFor="partner-proposal">Your proposal *</label><textarea id="partner-proposal" name="proposal" required minLength={80} maxLength={5000} rows={8} aria-describedby="partner-proposal-help" placeholder="Describe your offer, who it is for and the collaboration you have in mind." /><p id="partner-proposal-help" className={styles.helper}>80–5,000 characters. Include relevant pricing, booking details or an example of the partnership you are proposing. Please leave out sensitive personal information.</p></div>
      </div>
      <div className={styles.honeypot} aria-hidden="true"><label htmlFor="partner-honeypot">Leave this field empty</label><input id="partner-honeypot" name="honeypot" maxLength={200} tabIndex={-1} autoComplete="off" /></div>
      <label className={styles.checkboxField}><input type="checkbox" name="privacyAcknowledgement" required /><span>I have read the <Link href="/privacy">Privacy policy</Link> and understand that A Date At las will use these details to review and respond to this enquiry. *</span></label>
      <div className={styles.submitRow}><Button type="submit" className={styles.submit} disabled={busy}>{busy ? "Submitting proposal…" : "Submit partnership enquiry"}</Button></div>
    </fieldset>
    {state.status === "error" && <p className={styles.status} role="alert">{state.message} Your details are still here. You can also email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>}
  </form>;
}
