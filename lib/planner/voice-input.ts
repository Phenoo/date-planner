export type VoiceResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
export type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: VoiceResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => VoiceRecognition;
declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

export function voiceRecognitionConstructor() {
  if (typeof window === "undefined" || !window.isSecureContext) return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}
export const voiceInputSupported = () => !!voiceRecognitionConstructor();
export const voiceNoteSeconds = 60;
export type VoicePhase = "starting" | "listening" | "stopping";
export type VoiceProgress = { phase: VoicePhase; transcript: string; seconds: number };

export function voiceErrorMessage(code: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed": return "Voice input is blocked. Allow microphone and speech recognition in your browser or device settings, then try again. You can still type.";
    case "audio-capture": return "No microphone is available. Check your microphone, or type your message.";
    case "no-speech": return "I didn’t catch any speech. Try speaking again, or type your message.";
    case "network": return "The speech service couldn’t connect. Check your connection and try again, or type your message.";
    case "language-not-supported": return "Your browser’s speech service doesn’t support the selected language. You can use your keyboard’s microphone or type instead.";
    default: return "Voice input couldn’t finish. Try again, or type your message.";
  }
}

// Recognition results contain the full session, including revisions to earlier interim words.
export function voiceTranscript(event: VoiceResultEvent) {
  return Array.from(event.results, (result) => result[0]?.transcript.trim() ?? "").filter(Boolean).join(" ");
}
export function appendVoiceTranscript(draft: string, transcript: string) {
  return transcript.trim() ? `${draft.trimEnd()}${draft.trim() ? " " : ""}${transcript.trim()}` : draft;
}

export function createVoiceSession(recognition: VoiceRecognition, options: {
  language: string;
  maxCharacters: number;
  onProgress: (progress: VoiceProgress) => void;
  onComplete: (transcript: string, error: string) => void;
}) {
  let active = true;
  let started = false;
  let phase: VoicePhase = "starting";
  let transcript = "";
  let error = "";
  let seconds = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let finishing: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => { clearInterval(interval); clearTimeout(deadline); clearTimeout(finishing); };
  const detach = () => { recognition.onstart = null; recognition.onresult = null; recognition.onerror = null; recognition.onend = null; };
  const publish = () => { if (active) options.onProgress({ phase, transcript, seconds }); };
  const finish = (abort = false) => {
    if (!active) return;
    active = false;
    clearTimers(); detach();
    if (abort) { try { recognition.abort(); } catch { /* An ended browser session needs no further cleanup. */ } }
    options.onComplete(transcript, error || (!transcript ? voiceErrorMessage("no-speech") : ""));
  };
  const stop = () => {
    if (!active || phase === "stopping") return;
    phase = "stopping";
    clearInterval(interval); clearTimeout(deadline);
    publish();
    // Some engines stop capturing without delivering an end event.
    finishing = setTimeout(() => finish(true), 5000);
    try { recognition.stop(); } catch { finish(true); }
  };
  recognition.lang = options.language;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    if (!active || phase !== "starting") return;
    clearTimeout(deadline);
    phase = "listening"; publish();
    interval = setInterval(() => { seconds = Math.min(voiceNoteSeconds, seconds + 1); publish(); }, 1000);
    deadline = setTimeout(stop, voiceNoteSeconds * 1000);
  };
  recognition.onresult = (event) => {
    if (!active) return;
    transcript = voiceTranscript(event); publish();
    if (transcript.length >= options.maxCharacters) stop();
  };
  recognition.onerror = (event) => {
    if (!active) return;
    if (event.error === "no-speech" && transcript) { finish(true); return; }
    if (event.error !== "aborted" || phase !== "stopping") error = voiceErrorMessage(event.error);
    finish(true);
  };
  recognition.onend = () => finish();
  return {
    start() {
      if (!active || started) return;
      started = true;
      publish();
      deadline = setTimeout(() => { error = "Voice input didn’t start. Check microphone permission, or type your message."; finish(true); }, voiceNoteSeconds * 1000);
      try { recognition.start(); } catch (failure) {
        error = voiceErrorMessage(failure instanceof DOMException && failure.name === "NotAllowedError" ? "not-allowed" : "unknown");
        finish(true);
      }
    },
    stop,
    cancel() {
      if (!active) return;
      active = false; clearTimers(); detach();
      try { recognition.abort(); } catch { /* The browser may already have released the microphone. */ }
      options.onComplete("", "");
    },
    dispose() {
      if (!active) return;
      active = false; clearTimers(); detach();
      try { recognition.abort(); } catch { /* The browser may already have released the microphone. */ }
    },
  };
}
