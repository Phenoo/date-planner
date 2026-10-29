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
  return <Dialog open={open} onOpenChange={onOpenChange} title={signedIn ? "Your account · a date at las" : "Welcome to a date at las"} description="Sign in or create an account to keep your date plans together." className={styles.screen}>
    <div className={styles.layout}>
      <aside className={styles.story} aria-hidden="true">
        <span className={`atlas-wordmark ${styles.storyBrand}`}>a date at las<span>.</span></span>
        <div className={styles.storyContent}>
          <div className={styles.illustration}><LottieAnimation animation="guests" label="A warm welcome for you two" width="100%" height="100%" loop /></div>
          <span className={styles.kicker}>YOUR NEXT CHAPTER</span>
          <h2>More moments.<br />More memories.</h2>
          <p>Give your favorite date plans a home. Come back to them whenever inspiration calls.</p>
        </div>
        <span className={styles.storySignature}>THOUGHTFULLY PLANNED. PERSONALLY YOURS.</span>
      </aside>
      <section className={styles.panel}>
        <span className={`atlas-wordmark ${styles.mobileBrand}`}>a date at las<span>.</span></span>
        <div className={styles.inner}>{children}</div>
      </section>
    </div>
  </Dialog>;
}
