export type AnalyticsChoice = "accepted" | "declined";
export type AnalyticsEvent = "planner_started" | "recommendation_accepted" | "recommendation_rejected" | "authentication_completed";
type Parameters = Record<string, string | number | boolean>;
export type GoogleTag = (...command: ["js", Date] | ["consent", "default" | "update", Parameters] | ["config", string, Parameters] | ["set", Parameters] | ["event", string, Parameters]) => void;

export const analyticsChoiceKey = "date-atlas:analytics-choice:v1";
const pageTitles = {
  "/": "Home", "/plan": "Planner", "/explore": "Explore", "/saved": "My dates",
  "/favorites": "Favorites", "/profile": "Profile", "/privacy": "Privacy", "/terms": "Terms",
};

export function analyticsMeasurementId(value: string | undefined) {
  return value && /^G-[A-Z0-9]{10}$/.test(value) ? value : null;
}

export function analyticsPage(pathname: string) {
  const path = pathname.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  const title = Object.entries(pageTitles).find(([key]) => key === path)?.[1];
  if (title) return { path, title: `${title} · adal` };
  if (/^\/invite\/[^/]+$/.test(path)) return { path: "/invite", title: "Invitation · adal" };
  if (/^\/experiences\/[^/]+$/.test(path)) return { path: "/experiences", title: "Experience · adal" };
  return null;
}

export function analyticsReferrer(raw: string, origin: string) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.origin === origin ? new URL(analyticsPage(url.pathname)?.path ?? "/", origin).href : `${url.origin}/`;
  } catch { return ""; }
}

export function readAnalyticsChoice(storage: Pick<Storage, "getItem">): AnalyticsChoice | null {
  try {
    const choice = storage.getItem(analyticsChoiceKey);
    return choice === "accepted" || choice === "declined" ? choice : null;
  } catch { return null; }
}

const advertisingDenied = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };

export function createAnalyticsSession(id: string, origin: string, send: GoogleTag, setDisabled: (disabled: boolean) => void) {
  let accepted = false;
  let initialized = false;
  let lastPath: string | null = null;
  let page: Parameters | null = null;
  return {
    consent(granted: boolean) {
      if (accepted === granted) return;
      accepted = granted;
      setDisabled(!granted);
      if (initialized) send("consent", "update", { ...advertisingDenied, analytics_storage: granted ? "granted" : "denied" });
      if (!granted) { lastPath = null; page = null; }
    },
    pageView(pathname: string, referrer: string) {
      if (!accepted) return;
      const safe = analyticsPage(pathname);
      setDisabled(!safe);
      if (!safe) { lastPath = null; page = null; return; }
      if (lastPath === pathname) return;
      const next = {
        page_location: new URL(safe.path, origin).href,
        page_title: safe.title,
        page_referrer: typeof page?.page_location === "string" ? page.page_location : analyticsReferrer(referrer, origin),
      };
      if (!initialized) {
        send("consent", "default", { ...advertisingDenied, analytics_storage: "granted" });
        send("js", new Date());
        send("config", id, {
          ...next, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
          cookie_domain: new URL(origin).hostname, cookie_flags: "SameSite=Lax;Secure",
        });
        initialized = true;
      } else send("set", next);
      page = next; lastPath = pathname;
      send("event", "page_view", { ...page, send_to: id });
    },
    event(event: AnalyticsEvent) {
      if (accepted && page) send("event", event, { ...page, send_to: id });
    },
  };
}
