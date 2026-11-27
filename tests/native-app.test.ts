import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isNativeApp, useNativeApp } from "../components/date-atlas/use-native-app";

test("native navigation requires a WebView bridge and keeps server rendering consistent", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  function NativeView() {
    return createElement("span", null, String(useNativeApp()));
  }
  try {
    Reflect.deleteProperty(globalThis, "window");
    assert.equal(isNativeApp(), false);
    for (const { bridge, native } of [
      { bridge: undefined, native: false },
      { bridge: null, native: false },
      { bridge: true, native: false },
      { bridge: {}, native: false },
      { bridge: { postMessage: "invalid" }, native: false },
      { bridge: { postMessage() {} }, native: true },
    ]) {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { ReactNativeWebView: bridge } });
      assert.equal(isNativeApp(), native);
      assert.equal(renderToStaticMarkup(createElement(NativeView)), "<span>false</span>");
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
