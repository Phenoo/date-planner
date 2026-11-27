export const plannerAppearanceKey = "date-atlas:planner-appearance:v1";
export type PlannerAppearance = "white" | "red" | "dark";

let currentAppearance: PlannerAppearance = "red";

export function parsePlannerAppearance(value: unknown): PlannerAppearance {
  return value === "white" || value === "dark" ? value : "red";
}

export function readPlannerAppearance(): PlannerAppearance {
  try { currentAppearance = parsePlannerAppearance(window.localStorage.getItem(plannerAppearanceKey)); }
  catch { /* Keep this visit's appearance when browser storage is unavailable. */ }
  return currentAppearance;
}

export function savePlannerAppearance(appearance: PlannerAppearance) {
  currentAppearance = appearance;
  try { window.localStorage.setItem(plannerAppearanceKey, appearance); }
  catch { /* The current visit still keeps the selected appearance. */ }
}

export function applyPageSurface(root: Pick<HTMLElement, "getAttribute" | "setAttribute" | "removeAttribute">, pathname: string, appearance: PlannerAppearance) {
  if (root.getAttribute("data-native-app") === "true") root.setAttribute("data-native-theme", appearance);
  else root.removeAttribute("data-native-theme");
  if (pathname !== "/") root.removeAttribute("data-home-account");
  if (pathname === "/plan" || pathname === "/" && root.getAttribute("data-home-account") !== "true") root.setAttribute("data-page-surface", pathname === "/" ? "home" : "planner");
  else root.removeAttribute("data-page-surface");
  if (pathname === "/plan") root.setAttribute("data-planner-appearance", appearance);
  else root.removeAttribute("data-planner-appearance");
}

// This runs while the document is parsed, before React or browser-storage effects.
export const pageSurfaceBootstrap = `(function(){var r=document.documentElement,p=window.location.pathname,t="red";if(p==="/")r.setAttribute("data-page-surface","home");else if(p==="/plan"){try{var s=window.localStorage.getItem(${JSON.stringify(plannerAppearanceKey)});if(s==="white"||s==="red"||s==="dark")t=s}catch(e){}r.setAttribute("data-page-surface","planner");r.setAttribute("data-planner-appearance",t)}})();`;
