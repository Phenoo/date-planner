export function canUseGoogleSignIn() {
  if (typeof window === "undefined") return false;
  const bridge = "ReactNativeWebView" in window ? window.ReactNativeWebView : null;
  const native = bridge !== null && typeof bridge === "object" && "postMessage" in bridge && typeof bridge.postMessage === "function";
  return !native || "__dateAtlasNativeAuth" in window && window.__dateAtlasNativeAuth === true;
}

export function subscribeGoogleSignIn(notify: () => void) {
  window.addEventListener("dateatlas:native-ready", notify);
  return () => window.removeEventListener("dateatlas:native-ready", notify);
}
