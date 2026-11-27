"use client";

import Link from "next/link";
import { getBrowserAuth } from "@/lib/firebase/client";
import { continuationPath, readPlanningContinuation } from "@/lib/planner/planning-continuation";
import type { PlannerMode } from "@/lib/planner/intake";
import { Dialog } from "@/components/ui/dialog";
import { AtlasIcon, type AtlasIconName } from "./atlas-icon";
import styles from "./native-app.module.css";

export function nativePlanningPath() {
  const owner = getBrowserAuth()?.currentUser;
  try {
    const continuation = readPlanningContinuation(sessionStorage, { id: owner?.uid ?? null, anonymous: !owner || owner.isAnonymous });
    if (continuation) return continuationPath(continuation);
  } catch { /* The planner can open without browser storage. */ }
  return "/plan";
}

export type NativeTab = "home" | "planner" | "saved" | "profile";

export function NativeAppHeader({ title, subtitle, onHome, onPlus }: {
  title: string;
  subtitle?: string;
  onHome?: () => void;
  onPlus?: () => void;
}) {
  return <header className={styles.header}>
    <div className={styles.headerLeading}>
      {onHome && <button type="button" className={styles.iconButton} aria-label="Go home" onClick={onHome}><AtlasIcon name="house" /></button>}
      <div><span className={styles.headerTitle}>{title}</span>{subtitle && <p>{subtitle}</p>}</div>
    </div>
    {onPlus && <button type="button" className={styles.plusButton} onClick={onPlus}><AtlasIcon name="membership" size={17} />Plus</button>}
  </header>;
}

const tabs: { view: NativeTab; href: string; label: string; icon: AtlasIconName }[] = [
  { view: "home", href: "/", label: "Home", icon: "house" },
  { view: "planner", href: "/plan", label: "Plan", icon: "plan-note" },
  { view: "saved", href: "/saved", label: "Dates", icon: "date-book" },
  { view: "profile", href: "/profile", label: "Us", icon: "us-rings" },
];

export function NativeAppNavigation({ active, onNavigate, onPlan }: {
  active?: NativeTab;
  onNavigate?: (path: string) => void;
  onPlan: () => void;
}) {
  return <nav className={styles.tabbar} aria-label="App navigation">
    {tabs.map(tab => {
      const content = <><span><AtlasIcon name={tab.icon} size={21} /></span>{tab.label}</>;
      return tab.view === "planner"
        ? <button key={tab.view} type="button" aria-current={active === tab.view ? "page" : undefined} onClick={() => { if (active !== "planner") onPlan(); }}>{content}</button>
        : <Link key={tab.view} href={tab.href} aria-current={active === tab.view ? "page" : undefined} onNavigate={onNavigate ? event => { event.preventDefault(); onNavigate(tab.href); } : undefined}>{content}</Link>;
    })}
  </nav>;
}

export function NativePlannerModes({ mode, onChange, disabled }: {
  mode: PlannerMode;
  onChange: (mode: PlannerMode) => void;
  disabled?: boolean;
}) {
  return <div className={styles.plannerModes} role="group" aria-label="Planning mode">
    <button type="button" disabled={disabled} aria-pressed={mode === "steps"} onClick={() => onChange("steps")}>Quick plan</button>
    <button type="button" disabled={disabled} aria-pressed={mode === "chat"} onClick={() => onChange("chat")}>Chat with Oge</button>
  </div>;
}

export function NativePlusCard({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className={styles.plusCard} onClick={onOpen}>
    <span className={styles.plusCardMark}><AtlasIcon name="repeat-2" size={23} /></span>
    <span><small>Plus</small><strong>Date night, on repeat.</strong><span>A fresh plan. A little less “we should”.</span></span>
    <AtlasIcon name="arrow-up-right" size={18} />
  </button>;
}

export function NativePlusPreview({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange} title="A Date At las Plus" className={`${styles.surface} ${styles.plusPreview}`}>
    <div className={styles.plusIntro}>
      <span className={styles.membershipTicket}><AtlasIcon name="us-rings" size={34} /><strong>PLUS</strong></span>
      <h2>Make good dates<br />a regular thing.</h2>
      <p>Less figuring it out.<br />More looking forward to it.</p>
    </div>
    <div className={styles.benefits}>
      <div><AtlasIcon name="repeat-2" /><span><strong>A date-night rhythm</strong><p>Fresh ideas every week, two weeks, or month.</p></span></div>
      <div><AtlasIcon name="plan-note" /><span><strong>More room to plan</strong><p>More recommendations and place changes around your interests and budget.</p></span></div>
      <div><AtlasIcon name="calendar-heart" /><span><strong>Make the occasion yours</strong><p>Thoughtful picks for little rituals and the dates that matter.</p></span></div>
    </div>
    <p className={styles.comingSoon} role="status">Plus is coming. Pricing and availability will be confirmed before launch.</p>
    <button type="button" className={styles.primary} onClick={() => onOpenChange(false)}>Keep exploring</button>
    <p className={styles.helper}>Explore, save ideas and share wishlists for free.</p>
  </Dialog>;
}
