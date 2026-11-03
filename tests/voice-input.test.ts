import test from "node:test";
import assert from "node:assert/strict";
import { appendVoiceTranscript, createVoiceSession, voiceErrorMessage, voiceInputSupported, voiceRecognitionConstructor, type VoiceProgress, type VoiceRecognition, type VoiceResultEvent } from "../lib/planner/voice-input";

class RecognitionFixture implements VoiceRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: VoiceRecognition["onstart"] = null;
  onresult: VoiceRecognition["onresult"] = null;
  onerror: VoiceRecognition["onerror"] = null;
  onend: VoiceRecognition["onend"] = null;
  starts = 0;
  stops = 0;
  aborts = 0;
  start() { this.starts++; }
  stop() { this.stops++; }
  abort() { this.aborts++; }
  result(...parts: string[]) { this.onresult?.({ results: parts.map((transcript) => [{ transcript }]) }); }
}
function capture(recognition = new RecognitionFixture(), maxCharacters = 1200) {
  const updates: VoiceProgress[] = [];
  const completed: { text: string; error: string }[] = [];
  const session = createVoiceSession(recognition, { language: "en", maxCharacters, onProgress: (value) => updates.push(value), onComplete: (text, error) => completed.push({ text, error }) });
  return { recognition, updates, completed, session };
}

test("voice starts deliberately, replaces revised results, and waits for final words before review", (t) => {
  const { recognition, updates, completed, session } = capture();
  t.after(() => session.dispose());
  assert.equal(recognition.starts, 0);
  session.start(); session.start();
  assert.equal(recognition.starts, 1);
  assert.equal(updates.at(-1)?.phase, "starting");
  recognition.onstart?.();
  recognition.result("A romantic date", "in Lay");
  recognition.result("A romantic date", "in Lagos for two");
  assert.equal(updates.at(-1)?.transcript, "A romantic date in Lagos for two");
  assert.equal(completed.length, 0, "Recognized speech must not auto-send or finish while listening");
  session.stop(); session.stop();
  assert.equal(recognition.stops, 1);
  recognition.result("A romantic date", "in Lagos for two at 7:45 PM");
  assert.equal(completed.length, 0);
  recognition.onend?.();
  assert.deepEqual(completed, [{ text: "A romantic date in Lagos for two at 7:45 PM", error: "" }]);
  assert.equal(recognition.onresult, null);
});

test("discard ignores late speech callbacks and never inserts captured words", (t) => {
  const { recognition, completed, updates, session } = capture();
  t.after(() => session.dispose());
  session.start(); recognition.onstart?.(); recognition.result("discard this");
  const lateResult = recognition.onresult;
  const lateEnd = recognition.onend;
  session.cancel();
  const count = updates.length;
  lateResult?.({ results: [[{ transcript: "must not return" }]] }); lateEnd?.();
  assert.deepEqual(completed, [{ text: "", error: "" }]);
  assert.equal(updates.length, count);
  assert.equal(recognition.aborts, 1);
});

test("unmount releases the microphone and prevents callbacks or timer updates", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { recognition, completed, updates, session } = capture();
  session.start(); recognition.onstart?.();
  const lateStart = recognition.onstart;
  const lateError = recognition.onerror;
  const count = updates.length;
  session.dispose(); session.dispose();
  lateStart?.(); lateError?.({ error: "network" });
  t.mock.timers.tick(120000);
  assert.equal(recognition.aborts, 1);
  assert.equal(updates.length, count);
  assert.deepEqual(completed, []);
});

test("a 60 second note stops once and a missing end event cannot leave recording stuck", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { recognition, updates, completed, session } = capture();
  t.after(() => session.dispose());
  session.start(); recognition.onstart?.(); recognition.result("Keep all these words");
  t.mock.timers.tick(60000);
  assert.equal(recognition.stops, 1);
  assert.equal(updates.at(-1)?.phase, "stopping");
  assert.equal(completed.length, 0);
  t.mock.timers.tick(5000);
  assert.equal(recognition.aborts, 1);
  assert.deepEqual(completed, [{ text: "Keep all these words", error: "" }]);
});

test("a pending permission request times out cleanly without starting a second session", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { recognition, completed, session } = capture();
  session.start();
  const lateStart = recognition.onstart;
  t.mock.timers.tick(60000); lateStart?.();
  assert.equal(recognition.starts, 1);
  assert.equal(recognition.aborts, 1);
  assert.match(completed[0]?.error ?? "", /didn’t start/);
  assert.equal(completed[0]?.text, "");
});

test("long speech stops capture and retains every word for editing rather than truncating the request", (t) => {
  const { recognition, completed, session } = capture(new RecognitionFixture(), 12);
  t.after(() => session.dispose());
  session.start(); recognition.onstart?.();
  const text = "A romantic date with a budget of sixty thousand naira";
  recognition.result(text); recognition.onend?.();
  assert.equal(recognition.stops, 1);
  assert.equal(completed[0]?.text, text);
  assert.equal(appendVoiceTranscript("Already typed.", text), `Already typed. ${text}`);
  assert.equal(appendVoiceTranscript("Keep this exact draft\n", "  "), "Keep this exact draft\n");
});

test("permission and service failures explain recovery, preserve partial text and never restart capture", (t) => {
  for (const code of ["not-allowed", "service-not-allowed", "audio-capture", "network", "no-speech", "language-not-supported"]) {
    const { recognition, completed, session } = capture();
    t.after(() => session.dispose());
    session.start(); recognition.onstart?.();
    if (code === "network") recognition.result("Preserve my preferences");
    recognition.onerror?.({ error: code }); recognition.onend?.();
    assert.equal(recognition.starts, 1);
    assert.equal(completed.length, 1);
    assert.equal(completed[0].text, code === "network" ? "Preserve my preferences" : "");
    assert.equal(completed[0].error, voiceErrorMessage(code));
  }
});

test("a synchronous permission rejection and stop failure still release browser resources", (t) => {
  const denied = new RecognitionFixture();
  denied.start = () => { throw new DOMException("fixture", "NotAllowedError"); };
  const first = capture(denied);
  t.after(() => first.session.dispose());
  first.session.start();
  assert.match(first.completed[0]?.error ?? "", /blocked/);
  assert.equal(denied.aborts, 1);
  const failed = new RecognitionFixture();
  failed.stop = () => { throw new Error("already ended"); };
  const second = capture(failed);
  t.after(() => second.session.dispose());
  second.session.start(); failed.onstart?.(); failed.result("Review this"); second.session.stop();
  assert.deepEqual(second.completed, [{ text: "Review this", error: "" }]);
  assert.equal(failed.aborts, 1);
});

test("speech feature detection supports standard and Safari constructors without creating a session", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Reflect.deleteProperty(globalThis, "window");
    assert.equal(voiceInputSupported(), false);
    for (const property of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true, [property]: RecognitionFixture } });
      assert.equal(voiceRecognitionConstructor(), RecognitionFixture);
    }
    Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: false, SpeechRecognition: RecognitionFixture } });
    assert.equal(voiceInputSupported(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("empty recognition results return a useful retry prompt", (t) => {
  const { recognition, session, completed } = capture();
  t.after(() => session.dispose());
  session.start(); recognition.onstart?.();
  const empty: VoiceResultEvent = { results: [[]] };
  recognition.onresult?.(empty); recognition.onend?.();
  assert.deepEqual(completed, [{ text: "", error: voiceErrorMessage("no-speech") }]);
});

test("a silence timeout after recognized speech keeps the transcript without claiming nothing was heard", (t) => {
  const { recognition, session, completed } = capture();
  t.after(() => session.dispose());
  session.start(); recognition.onstart?.(); recognition.result("An outdoor date for two");
  recognition.onerror?.({ error: "no-speech" });
  assert.deepEqual(completed, [{ text: "An outdoor date for two", error: "" }]);
});
