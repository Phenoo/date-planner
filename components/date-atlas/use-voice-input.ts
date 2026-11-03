"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createVoiceSession, voiceInputSupported, voiceRecognitionConstructor, type VoiceProgress } from "@/lib/planner/voice-input";

const subscribe = () => () => {};
const serverSnapshot = () => false;

export function useVoiceInput(onTranscript: (text: string) => void, disabled: boolean) {
  const supported = useSyncExternalStore(subscribe, voiceInputSupported, serverSnapshot);
  const [progress, setProgress] = useState<VoiceProgress | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const session = useRef<ReturnType<typeof createVoiceSession> | null>(null);
  useEffect(() => {
    const stopInBackground = () => { if (document.visibilityState === "hidden") session.current?.stop(); };
    const stopOnExit = () => session.current?.cancel();
    document.addEventListener("visibilitychange", stopInBackground);
    window.addEventListener("pagehide", stopOnExit);
    return () => {
      document.removeEventListener("visibilitychange", stopInBackground);
      window.removeEventListener("pagehide", stopOnExit);
      session.current?.dispose(); session.current = null;
    };
  }, []);
  useEffect(() => {
    if (!disabled) return;
    session.current?.cancel(); session.current = null;
  }, [disabled]);
  function start(maxCharacters: number) {
    if (disabled || session.current) return;
    const Recognition = voiceRecognitionConstructor();
    if (!Recognition) { setError("Voice input isn’t available in this browser. Type your message or use your keyboard’s microphone."); return; }
    setError(""); setNotice("");
    try {
      const capture = createVoiceSession(new Recognition(), {
        language: document.documentElement.lang || navigator.language || "en",
        maxCharacters,
        onProgress: setProgress,
        onComplete: (text, failure) => {
          session.current = null; setProgress(null); setError(failure);
          if (text) { onTranscript(text); setNotice("Voice note converted to text. Review it below, then send when you’re ready."); }
        },
      });
      session.current = capture; capture.start();
    } catch { setError("Voice input couldn’t start. Try again, or type your message."); }
  }
  function cancel() {
    session.current?.dispose(); session.current = null;
    setProgress(null); setError(""); setNotice("Voice note discarded. Your typed message is kept.");
  }
  function clearFeedback() { setError(""); setNotice(""); }
  return { supported, progress, error, notice, active: !!progress, isActive: () => session.current !== null, start, stop: () => session.current?.stop(), cancel, clearFeedback };
}
