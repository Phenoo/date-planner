import test from "node:test";
import assert from "node:assert/strict";
import { lockBodyScroll } from "../lib/planner/body-scroll-lock";

test("nested locks restore scrolling when the outer effect cleans up before the inner effect", () => {
  const body = { style: { overflow: "" } };
  const releaseOuter = lockBodyScroll(body);
  const releaseInner = lockBodyScroll(body);
  assert.equal(body.style.overflow, "hidden");
  releaseOuter();
  assert.equal(body.style.overflow, "hidden");
  releaseInner();
  assert.equal(body.style.overflow, "");
});

test("nested locks also preserve the original overflow when cleanup happens in reverse order", () => {
  const body = { style: { overflow: "auto" } };
  const releaseOuter = lockBodyScroll(body);
  const releaseInner = lockBodyScroll(body);
  releaseInner();
  assert.equal(body.style.overflow, "hidden");
  releaseOuter();
  assert.equal(body.style.overflow, "auto");
});

test("duplicate cleanup cannot release another owner or a later lock", () => {
  const body = { style: { overflow: "scroll" } };
  const releaseFirst = lockBodyScroll(body);
  const releaseSecond = lockBodyScroll(body);
  releaseFirst();
  releaseFirst();
  assert.equal(body.style.overflow, "hidden");
  releaseSecond();
  assert.equal(body.style.overflow, "scroll");
  const releaseNext = lockBodyScroll(body);
  releaseFirst();
  releaseSecond();
  assert.equal(body.style.overflow, "hidden");
  releaseNext();
  assert.equal(body.style.overflow, "scroll");
});

test("independent targets retain their own active owners and original overflow", () => {
  const first = { style: { overflow: "clip" } };
  const second = { style: { overflow: "auto" } };
  const releaseFirst = lockBodyScroll(first);
  const releaseSecond = lockBodyScroll(second);
  const releaseNestedSecond = lockBodyScroll(second);
  releaseFirst();
  assert.equal(first.style.overflow, "clip");
  assert.equal(second.style.overflow, "hidden");
  releaseNestedSecond();
  assert.equal(second.style.overflow, "hidden");
  releaseSecond();
  assert.equal(second.style.overflow, "auto");
});

test("each new lock captures the current inline overflow, including an existing hidden value", () => {
  const body = { style: { overflow: "hidden" } };
  const releaseInitial = lockBodyScroll(body);
  releaseInitial();
  assert.equal(body.style.overflow, "hidden");
  body.style.overflow = "visible";
  const releaseNext = lockBodyScroll(body);
  assert.equal(body.style.overflow, "hidden");
  releaseNext();
  assert.equal(body.style.overflow, "visible");
});
