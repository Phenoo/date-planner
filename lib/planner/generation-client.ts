import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";

function waitForRetry(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2000);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function requestGeneration(body: string, key: string, signal: AbortSignal, progress: (stage: string) => void) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(75000)]);
  for (let poll = 0; poll < 30; poll++) {
    const response = await plannerFetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson", "Idempotency-Key": key }, body, signal: deadline });
    const data: unknown = await readPlanningResponse(response, progress);
    if (!data || typeof data !== "object" || !("pending" in data) || data.pending !== true) return data;
    progress("Your date is already being prepared. Keeping the same request together");
    await waitForRetry(deadline);
  }
  throw new Error("Your date is still being prepared. Your answers are safe; please retry shortly.");
}
