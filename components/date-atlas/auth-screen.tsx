"use client";

import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { LottieAnimation } from "@/components/animations/lottie-animation";
import styles from "./auth-screen.module.css";

export function AuthScreen({ open, onOpenChange, signedIn, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
  children: ReactNode;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange} title={signedIn ? "Your account · A Date At las" : "Welcome to A Date At las"} description={signedIn ? "Manage your sign-in, data and account." : "Sign in or create an account to keep your date plans together."} className={`${styles.screen} ${signedIn ? styles.accountScreen : ""}`}>
    <div className={styles.layout}>
      {!signedIn && <aside className={styles.story} aria-hidden="true">
        <span className={`atlas-wordmark ${styles.storyBrand}`}>A Date At las<span>.</span></span>
        <div className={styles.storyContent}>
          <div className={styles.illustration}><LottieAnimation animation="guests" label="A warm welcome for you two" width="100%" height="100%" loop /></div>
          <span className={styles.kicker}>YOUR NEXT CHAPTER</span>
          <h2>Keep a good<br />thing going.</h2>
          <p>Keep the plans you like. Come back when you’re ready to make them happen.</p>
        </div>
        <span className={styles.storySignature}>THOUGHTFULLY PLANNED. PERSONALLY YOURS.</span>
      </aside>}
      <section className={styles.panel}>
        <span className={`atlas-wordmark ${styles.mobileBrand}`}>A Date At las<span>.</span></span>
        <div className={styles.inner}>{children}</div>
      </section>
    </div>
  </Dialog>;
}
