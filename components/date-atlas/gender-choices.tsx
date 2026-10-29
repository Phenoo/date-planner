"use client";

import { genderOptions, type PlanRequest } from "@/lib/planner/schema";
import styles from "./gender-choices.module.css";

type Gender = PlanRequest["yourGender"];

function GenderIllustration({ gender }: { gender: Gender }) {
  return <svg viewBox="0 0 240 160" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="120" cy="145" rx="51" ry="5" fill="#EFDADD" />
    <path d="M37 66l5-8m-1 17l-9-1M194 47l6-7m-1 17l9 1" stroke="#D88A98" strokeWidth="2" strokeLinecap="round" />
    <g className={styles.floatingHeart}>
      <path d="M184 99c-15-10-14-19-8-20 5-1 8 2 8 5 1-4 5-6 9-4 7 4 2 13-9 19Z" fill="#D91335" />
    </g>
    {gender === "" ? <g className={styles.envelope} stroke="#341D26" strokeWidth="2.5" strokeLinejoin="round">
      <path d="m72 84 47-33 49 33v47a7 7 0 0 1-7 7H79a7 7 0 0 1-7-7Z" fill="#F7BAC5" />
      <g className={styles.letter}>
        <rect x="83" y="40" width="76" height="82" rx="9" fill="#FFF" transform="rotate(-7 121 81)" />
        <path d="M122 88c-22-14-20-26-11-27 6-1 10 3 10 7 2-6 7-9 12-6 10 5 5 16-11 26Z" fill="#D91335" stroke="none" />
        <path d="M103 99h34m-30 8h22" stroke="#D88A98" strokeLinecap="round" />
      </g>
      <path d="m72 84 48 31 48-31v47a7 7 0 0 1-7 7H79a7 7 0 0 1-7-7Z" fill="#FFF3F5" />
      <path d="m74 134 32-28m60 28-32-28" />
      <path d="M121 124c-8-5-8-10-4-10 2-1 4 1 4 2 1-2 3-3 5-2 4 2 1 7-5 10Z" fill="#D91335" stroke="none" />
    </g> : <g className={styles.person} stroke="#341D26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {gender === "woman" && <path d="M84 91c-15-22-10-61 12-70 17-7 40-4 53 10 10 13 8 38 4 61l-4 29H84Z" fill="#341D26" />}
      <path d="M72 142c2-27 18-40 48-40s46 13 48 40" fill={gender === "man" ? "#FFF" : "#D91335"} />
      {gender === "man" ? <path d="m99 107 21 27 21-27m-21 27v10" stroke="#D91335" /> : <path d="M101 108c5 14 33 14 38 0" stroke="#FFF3F5" />}
      <path d="M109 92v16c5 7 17 7 22 0V92" fill="#C47A56" />
      <g className={styles.head}>
        <path d="M91 65c-10-9-15 7-4 13m62-13c10-9 15 7 4 13" fill="#C47A56" />
        <path d="M90 52c0-20 60-22 60 0v23c0 20-17 30-30 30S90 95 90 75Z" fill={gender === "non-binary" ? "#B56A48" : "#D99A75"} />
        {gender === "woman" && <>
          <path d="M87 63c-3-23 10-32 24-35 8 16 21 24 41 25l-1-18-29-13-29 9Z" fill="#341D26" />
          <path d="M89 49c-7 22-6 42-11 61m12-39c-1 18-1 31-5 43m66-66c7 22 6 42 11 61m-12-38c1 18 1 31 5 43" stroke="#341D26" strokeWidth="6" />
          <circle cx="88" cy="80" r="5" stroke="#D91335" />
          <circle cx="152" cy="80" r="5" stroke="#D91335" />
        </>}
        {gender === "man" && <>
          <path d="M89 63c-5-4-8-16-2-22-2-10 7-16 14-14 5-9 16-8 21-3 8-5 19-1 20 5 13-1 18 11 11 20l-3 14-7-19c-12 7-31 7-45 2Z" fill="#341D26" />
          <path d="M103 91c8 10 26 10 34 0" stroke="#341D26" strokeWidth="4" />
        </>}
        {gender === "non-binary" && <>
          <path d="M88 62c-10-16-5-37 9-41 5-13 24-11 31-6 22-5 34 14 27 29l-5 19-9-18c-13 6-30 6-43-1Z" fill="#341D26" />
          <path d="M99 28c5-7 13-9 19-8m12 6c6 0 12 3 14 8" stroke="#FFF3F5" />
          <path d="M97 69h17m12 0h17m-29 0h12" stroke="#341D26" />
          <rect x="96" y="63" width="19" height="15" rx="5" />
          <rect x="125" y="63" width="19" height="15" rx="5" />
          <circle cx="151" cy="83" r="3" fill="#D91335" stroke="none" />
        </>}
        <path d="m100 58 10-1m20 0 10 1" />
        <g className={styles.eyes} fill="#341D26" stroke="none">
          <ellipse cx="106" cy="70" rx="2" ry="3" />
          <ellipse cx="134" cy="70" rx="2" ry="3" />
        </g>
        <path d="m120 72-2 10h4m-10 7c5 4 11 4 16 0" />
        <circle cx="99" cy="81" r="4" fill="#D47C70" stroke="none" opacity=".55" />
        <circle cx="141" cy="81" r="4" fill="#D47C70" stroke="none" opacity=".55" />
      </g>
      <g className={styles.wave}>
        <path d="m160 135 15-22 9 5-10 23" fill={gender === "man" ? "#FFF" : "#D91335"} />
        <path d="m175 113-3-9c-2-5-1-8 2-7l5 8 2-19c0-4 4-4 4 0v13l3-16c1-4 5-3 4 1l-2 17 4-12c2-4 5-2 4 1l-3 15 4-6c2-3 5-1 3 3l-10 17c-3 5-12 3-17-6Z" fill={gender === "non-binary" ? "#B56A48" : "#D99A75"} />
      </g>
    </g>}
  </svg>;
}

export function GenderChoices({ selected, onChoose, disabled = false }: {
  selected: Gender;
  onChoose: (value: Gender) => void;
  disabled?: boolean;
}) {
  return <div className={styles.grid} role="group" aria-label="Gender options">
    {genderOptions.map((option, index) => {
      const chosen = selected === option.value;
      return <button type="button" key={option.value} className={`${styles.card} ${chosen ? styles.selected : ""}`} aria-pressed={chosen} disabled={disabled} onClick={() => onChoose(option.value)}>
        <span className={styles.art} aria-hidden="true"><GenderIllustration gender={option.value} /></span>
        <span className={styles.caption}>
          <span className={styles.letterKey} aria-hidden="true">{String.fromCharCode(65 + index)}</span>
          <span>{option.label}</span>
          <span className={styles.check} aria-hidden="true">{chosen ? "✓" : ""}</span>
        </span>
      </button>;
    })}
  </div>;
}
