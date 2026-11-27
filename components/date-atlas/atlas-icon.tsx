import type { ReactNode, SVGProps } from "react";

const artwork = {
  "arrow-left": <>
    <path d="M21 12H4m6-6-6 6 6 6" />
  </>,
  "arrow-right": <>
    <path d="M3 12h17m-6-6 6 6-6 6" />
  </>,
  "arrow-up-right": <>
    <path d="m5 19 14-14M7 5h12v12" />
  </>,
  "arrow-up": <>
    <path d="M12 21V4m-6 6 6-6 6 6" />
  </>,
  "bell-ring": <>
    <path d="M5 15.5V10a7 7 0 0 1 14 0v5.5l2 3H3Z" fill="currentColor" fillOpacity=".15" />
    <path d="M5 15.5V10a7 7 0 0 1 14 0v5.5l2 3H3ZM9.6 21.3a2.8 2.8 0 0 0 4.8 0M1.6 6.9l1.5-2.5m19.3 2.5-1.5-2.5" />
  </>,
  "calendar-heart": <>
    <path d="M5 4.8h14a2 2 0 0 1 2 2v13.7H3V6.8a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity=".14" />
    <path d="M5 4.8h14a2 2 0 0 1 2 2v13.7H3V6.8a2 2 0 0 1 2-2ZM3 9h18M7 2.5V7M17 2.5V7" />
    <path d="M7.8 13.8c0-2.3 3.3-3 4.2-.9.9-2.1 4.2-1.4 4.2.9 0 2.2-4.2 5-4.2 5s-4.2-2.8-4.2-5Z" fill="currentColor" stroke="none" />
  </>,
  "check": <>
    <path d="m4.5 12 5 5 10-11" strokeWidth="2.4" />
  </>,
  "chevron-down": <>
    <path d="m5 8.5 7 7 7-7" />
  </>,
  "chevron-right": <>
    <path d="m8.5 5 7 7-7 7" />
  </>,
  "clock-3": <>
    <circle cx="12" cy="12.3" r="8.5" fill="currentColor" fillOpacity=".14" />
    <circle cx="12" cy="12.3" r="8.5" />
    <path d="M12 6.8v5.5l4 2.6M8.7 1.5h6.6" />
  </>,
  "cloud": <>
    <path d="M6.1 18.7a4.6 4.6 0 0 1-1.3-9A6.9 6.9 0 0 1 18 8.6a5.1 5.1 0 0 1-.1 10.1Z" fill="currentColor" fillOpacity=".15" />
    <path d="M6.1 18.7a4.6 4.6 0 0 1-1.3-9A6.9 6.9 0 0 1 18 8.6a5.1 5.1 0 0 1-.1 10.1ZM12 11.5V22m-3.5-7L12 11.5l3.5 3.5" />
  </>,
  "coffee-date": <>
    <g stroke="none"><path d="M2.6 8.4h14.7v6.3a7.35 7.35 0 0 1-14.7 0Z" fill="currentColor" /><path d="M17.3 10h1.1a3.2 3.2 0 0 1 0 6.4h-1.8M2 22h16.8M6.8 2.4C4.7 3.8 8.3 4.7 6.5 6M12.6 1.8c-2.1 1.4 1.5 2.3-.3 3.6" stroke="currentColor" strokeWidth="1.7" /><path d="M6.7 12.8c0-1.8 2.6-2.3 3.3-.7.7-1.6 3.3-1.1 3.3.7 0 1.7-3.3 3.8-3.3 3.8s-3.3-2.1-3.3-3.8Z" fill="var(--atlas-icon-cutout,#fff)" /></g>
  </>,
  "date-book": <>
    <g stroke="none"><path d="M5.2 4h13.6A2.7 2.7 0 0 1 21.5 6.7v13.8H5.2a2.7 2.7 0 0 1-2.7-2.7V6.7A2.7 2.7 0 0 1 5.2 4Z" fill="currentColor" /><path d="M6.5 2.3v4M17.5 2.3v4" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="3.8" /><path d="M6.5 2.3v3M17.5 2.3v3" stroke="currentColor" strokeWidth="2.4" /><path d="M5.7 9h12.6" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="1.6" /><rect x="6" y="12" width="4.2" height="4.3" rx="1" fill="var(--atlas-icon-cutout,#fff)" /><path d="M14 12.7h3.5m-3.5 3h3.5" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="1.6" /><path d="M6.1 22h13.4" stroke="currentColor" strokeWidth="1.4" /></g>
  </>,
  "dice": <>
    <g stroke="none"><rect x="2.4" y="8" width="12.8" height="12.8" rx="3.2" fill="currentColor" /><circle cx="6.3" cy="11.9" r="1.2" fill="var(--atlas-icon-cutout,#fff)" /><circle cx="11.3" cy="16.9" r="1.2" fill="var(--atlas-icon-cutout,#fff)" /><path d="M9.1 4.4 17 2.3a2.9 2.9 0 0 1 3.5 2l1.5 5.8a2.9 2.9 0 0 1-2 3.5l-2.6.7V10a4 4 0 0 0-4-4H8.4Z" fill="currentColor" fillOpacity=".5" /><circle cx="17.3" cy="7" r="1.2" fill="var(--atlas-icon-cutout,#fff)" /></g>
  </>,
  "dinner": <>
    <path d="m3.2 4.6 6.1-1.3 1.1 5.5a3.1 3.1 0 1 1-6.1 1.3Zm11.5-1.3 6.1 1.3-1.1 5.5a3.1 3.1 0 1 1-6.1-1.3Z" fill="currentColor" fillOpacity=".18" />
    <path d="m3.2 4.6 6.1-1.3 1.1 5.5a3.1 3.1 0 1 1-6.1 1.3ZM7.5 12.4 9 19.7m-4 .8 7.2-1.5M14.7 3.3l6.1 1.3-1.1 5.5a3.1 3.1 0 1 1-6.1-1.3ZM16.5 12.4 15 19.7m-3.2-.7 7.2 1.5M4 8.2l5.6-1.1m4.8 0L20 8.2" />
  </>,
  "discover-map": <>
    <g stroke="none"><path d="m2.5 5.3 6-2.5v15.5l-6 2.5Z" fill="currentColor" fillOpacity=".42" /><path d="m8.5 2.8 7 2.7V21l-7-2.7Z" fill="currentColor" fillOpacity=".72" /><path d="m15.5 5.5 6-2.5v15.5l-6 2.5Z" fill="currentColor" /><path d="M18.2 8.4c0 3.4-5.1 7.1-5.1 7.1S8 11.8 8 8.4a5.1 5.1 0 0 1 10.2 0Z" fill="var(--atlas-icon-cutout,#fff)" /><path d="M17.1 8.4c0 2.6-4 5.6-4 5.6s-4-3-4-5.6a4 4 0 0 1 8 0Z" fill="currentColor" /><circle cx="13.1" cy="8.4" r="1.2" fill="var(--atlas-icon-cutout,#fff)" /></g>
  </>,
  "heart-tag": <>
    <g stroke="none"><path d="M5 2.7h11.5a3 3 0 0 1 3 3v16.1L12.2 18 5 21.8Z" fill="currentColor" /><path d="M2.5 6.7v11.7" stroke="currentColor" strokeWidth="1.5" /><path d="M8 9.4c0-2 3.2-2.6 4-.8.8-1.8 4-1.2 4 .8 0 2.1-4 4.7-4 4.7S8 11.5 8 9.4Z" fill="var(--atlas-icon-cutout,#fff)" /></g>
  </>,
  "heart": <>
    <path className="atlas-heart-shape" d="M12 20.6S2.6 15.3 2.6 9.2c0-5.6 7.2-7.4 9.4-2.7 2.2-4.7 9.4-2.9 9.4 2.7 0 6.1-9.4 11.4-9.4 11.4Z" />
    <path d="M6.2 8.2c.6-1 1.6-1.3 2.5-.8" strokeWidth="1.5" />
  </>,
  "house": <>
    <path d="m3 10.1 9-7.5 9 7.5V20a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 20Z" fill="currentColor" fillOpacity=".14" />
    <path d="m1.7 11.1 10.3-8.5 10.3 8.5M3.8 9.8v10.5h5.4v-6.5h5.6v6.5h5.4V9.8" />
  </>,
  "log-in": <>
    <path d="M12.5 3H20v18h-7.5" fill="currentColor" fillOpacity=".15" />
    <path d="M12.5 3H20v18h-7.5M2 12h13m-4.5-4.5L15 12l-4.5 4.5" />
  </>,
  "map-pin": <>
    <path d="M19.2 9.7c0 5.1-7.2 11.7-7.2 11.7S4.8 14.8 4.8 9.7a7.2 7.2 0 0 1 14.4 0Z" fill="currentColor" fillOpacity=".16" />
    <path d="M19.2 9.7c0 5.1-7.2 11.7-7.2 11.7S4.8 14.8 4.8 9.7a7.2 7.2 0 0 1 14.4 0Z" />
    <circle cx="12" cy="9.7" r="2.5" />
  </>,
  "membership": <>
    <g stroke="none"><path d="M5 3.2h14A2.8 2.8 0 0 1 21.8 6v3a3 3 0 0 0 0 6v3a2.8 2.8 0 0 1-2.8 2.8H5A2.8 2.8 0 0 1 2.2 18v-3a3 3 0 0 0 0-6V6A2.8 2.8 0 0 1 5 3.2Z" fill="currentColor" /><path d="M15.9 6.2v1m0 4.3v1m0 4.3v1" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="1.4" /><path d="M6.3 11.2c0-2.1 3-2.9 3.8-.8.8-2.1 3.8-1.3 3.8.8 0 2-3.8 4.6-3.8 4.6s-3.8-2.6-3.8-4.6Z" fill="var(--atlas-icon-cutout,#fff)" /></g>
  </>,
  "navigation": <>
    <path d="m3 10.4 18.5-8-8 18.5-2.7-7.8Z" fill="currentColor" fillOpacity=".18" />
    <path d="m3 10.4 18.5-8-8 18.5-2.7-7.8ZM10.8 13.1 16 7.9" />
  </>,
  "notebook-pen": <>
    <path d="M5 3.5h13.5v17H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity=".14" />
    <path d="M5 3.5h13.5v17H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2ZM7 3.5v17M10.5 8h4M10.5 11.5H13m.5 6.5 5.8-5.8a1.2 1.2 0 0 1 1.7 1.7L15.2 20l-2.4.7Z" />
  </>,
  "oge-face": <>
    <g stroke="none"><path d="M21.2 10.7c.5 5.9-3.3 9.7-9.1 9.7H7.8l-5 1.4.8-5.3a9.8 9.8 0 0 1-1.2-4.7c-.4-5.5 3.1-9.3 8.7-9.3 5.5 0 9.7 2.6 10.1 8.2Z" fill="currentColor" /><path d="M7.4 9.6v1m8-1.7v1" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="2.2" /><path d="M8.5 14c1.4 2 4.8 2 6.5-.5" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="1.7" /></g>
  </>,
  "plan-note": <>
    <g stroke="none"><path d="M5.2 2.5h9l6.7 6.7v10.1a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 19.3V4.7a2.2 2.2 0 0 1 2.2-2.2Z" fill="currentColor" /><path d="M14.2 2.5v5a1.7 1.7 0 0 0 1.7 1.7h5" fill="var(--atlas-icon-cutout,#fff)" fillOpacity=".75" /><path d="M7 12h5m-5 4h3" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="1.8" /><path d="m13.3 16.2 1.7 1.7 3.7-4.4" stroke="var(--atlas-icon-cutout,#fff)" strokeWidth="1.8" /></g>
  </>,
  "plus": <>
    <path d="M12 4v16M4 12h16" />
  </>,
  "repeat-2": <>
    <path d="M4.4 8.5A8.3 8.3 0 0 1 19 6.2L21 9m-6-1 6 1 .3-6M19.6 15.5A8.3 8.3 0 0 1 5 17.8L3 15m6 1-6-1-.3 6" />
    <path d="M8.4 10.7c0-2 2.8-2.6 3.6-.7.8-1.9 3.6-1.3 3.6.7 0 1.9-3.6 4.2-3.6 4.2s-3.6-2.3-3.6-4.2Z" fill="currentColor" stroke="none" />
  </>,
  "search": <>
    <circle cx="10.2" cy="10.2" r="6.6" fill="currentColor" fillOpacity=".12" />
    <circle cx="10.2" cy="10.2" r="6.6" />
    <path d="m15.3 15.3 5.1 5.1" strokeWidth="2.7" />
  </>,
  "send": <>
    <path d="m2.7 4.1 18.6 7.8-18.6 8 3.5-8Z" fill="currentColor" fillOpacity=".16" />
    <path d="m2.7 4.1 18.6 7.8-18.6 8 3.5-8Zm3.5 7.8h15.1" />
  </>,
  "share-2": <>
    <path d="M6.3 8.3H3.5v12.2h17V8.3h-2.8M12 16V2.7m-4 4 4-4 4 4" />
  </>,
  "sliders-horizontal": <>
    <path d="M2.5 6.5h19m-19 11h19M7 3.5v6M17 14.5v6" />
    <rect x="4.5" y="4.5" width="5" height="4" rx="1.4" fill="currentColor" stroke="none" />
    <rect x="14.5" y="15.5" width="5" height="4" rx="1.4" fill="currentColor" stroke="none" />
  </>,
  "us-rings": <>
    <ellipse cx="8.3" cy="12" rx="5.1" ry="7.1" transform="rotate(-24 8.3 12)" stroke="currentColor" strokeWidth="3.7" opacity=".5" />
    <ellipse cx="15.7" cy="12" rx="5.1" ry="7.1" transform="rotate(24 15.7 12)" stroke="currentColor" strokeWidth="3.7" />
    <path d="M9.5 5.7a7.7 7.7 0 0 1 3 2.7" stroke="currentColor" strokeWidth="3.7" />
  </>,
  "user-plus": <>
    <circle cx="8.7" cy="7.4" r="3.8" fill="currentColor" fillOpacity=".18" />
    <circle cx="8.7" cy="7.4" r="3.8" />
    <path d="M2 21v-1.7a6.7 6.7 0 0 1 13.4 0V21ZM19 9v7m-3.5-3.5h7" />
  </>,
  "user-round": <>
    <circle cx="12" cy="7.7" r="4" fill="currentColor" fillOpacity=".18" />
    <circle cx="12" cy="7.7" r="4" />
    <path d="M4.5 21v-1.5a7.5 7.5 0 0 1 15 0V21Z" />
  </>,
  "users-round": <>
    <circle cx="8.2" cy="7.3" r="3.3" fill="currentColor" fillOpacity=".18" />
    <circle cx="8.2" cy="7.3" r="3.3" />
    <path d="M1.8 20v-1.8a6.4 6.4 0 0 1 12.8 0V20ZM16 4.3a3.3 3.3 0 0 1 0 6.5m2.1 2.5a5.9 5.9 0 0 1 4.1 5.6V20" />
  </>,
} satisfies Record<string, ReactNode>;

export type AtlasIconName = keyof typeof artwork;

type AtlasIconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: AtlasIconName;
  size?: number;
};

export function AtlasIcon({ name, size = 22, ...props }: AtlasIconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-atlas-icon={name} {...props}>
    {artwork[name]}
  </svg>;
}
