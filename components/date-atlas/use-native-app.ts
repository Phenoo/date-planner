"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverSnapshot = () => false;

export function isNativeApp() {
  if (typeof window === "undefined") return false;
  const bridge = "ReactNativeWebView" in window ? window.ReactNativeWebView : null;
  return bridge !== null && typeof bridge === "object" && "postMessage" in bridge && typeof bridge.postMessage === "function";
}

export function useNativeApp() {
  return useSyncExternalStore(subscribe, isNativeApp, serverSnapshot);
}
