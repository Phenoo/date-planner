import { test } from "node:test";
import assert from "node:assert/strict";
import { locationSettingsGuide } from "../lib/maps/location-settings";

test("location settings distinguish iOS browsers and iPads using a desktop user agent", () => {
  assert.equal(locationSettingsGuide("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1").id, "ios");
  assert.equal(locationSettingsGuide("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/131.0 Mobile/15E148 Safari/604.1").id, "ios-chrome");
  assert.equal(locationSettingsGuide("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", 5).id, "ios");
  assert.equal(locationSettingsGuide("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 FxiOS/131.0 Mobile/15E148").id, "other");
});

test("location settings use Android guidance before desktop browser tokens", () => {
  assert.equal(locationSettingsGuide("Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36").id, "android");
  assert.equal(locationSettingsGuide("Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0").id, "android");
});

test("desktop location settings do not mistake Chromium browsers for Safari", () => {
  assert.equal(locationSettingsGuide("Mozilla/5.0 (Macintosh) Chrome/131.0 Safari/537.36").id, "chrome");
  assert.equal(locationSettingsGuide("Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15").id, "safari");
  assert.equal(locationSettingsGuide("Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/132.0").id, "firefox");
  assert.equal(locationSettingsGuide("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36 Edg/131.0").id, "other");
  assert.equal(locationSettingsGuide("").id, "other");
});

