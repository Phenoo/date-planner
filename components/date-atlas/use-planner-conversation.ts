"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { conversationInput, conversationReplySchema, validateConversationCopy, type ConversationReply, type ConversationStep } from "@/lib/planner/conversation";
import type { PlanRequest } from "@/lib/planner/schema";

export function usePlannerConversation(step: ConversationStep, request: PlanRequest) {
  const [result, setResult] = useState<{ key: string; reply: ConversationReply } | null>(null);
  const cache = useRef(new Map<string, ConversationReply>());
  const readInput = useEffectEvent(() => conversationInput(step, request));
  useEffect(() => {
    const input = readInput();
    const key = JSON.stringify(input);
    const controller = new AbortController();
    const cached = cache.current.get(key);
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      if (cached) { setResult({ key, reply: cached }); return; }
      try {
        const response = await fetch("/api/planner-conversation", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8500)]) });
        if (!response.ok) return;
        const parsed = conversationReplySchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.step !== step || !validateConversationCopy(input, parsed.data) || controller.signal.aborted) return;
        if (cache.current.size >= 30) cache.current.clear();
        cache.current.set(key, parsed.data);
        setResult({ key, reply: parsed.data });
      } catch { /* The conversation continues immediately with local copy. */ }
    });
    return () => controller.abort();
  }, [step]);
  return result?.key === JSON.stringify(conversationInput(step, request)) ? result.reply : null;
}
