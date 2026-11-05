type RevealControlsViewport = {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  addEventListener(type: "scroll", listener: () => void, options: { passive: boolean }): void;
  removeEventListener(type: "scroll", listener: () => void): void;
};

type RevealControlsOptions = {
  schedule?: (callback: () => void, delayMs: number) => () => void;
  observeResize?: (callback: () => void) => () => void;
};

export function watchRevealControls(viewport: RevealControlsViewport, onReady: () => void, options: RevealControlsOptions = {}): () => void {
  let stopped = false;
  let elapsed = false;
  let scrolled = false;
  let cancelTimer = () => {};
  let disconnectResize = () => {};

  function cleanup() {
    if (stopped) return;
    stopped = true;
    viewport.removeEventListener("scroll", onScroll);
    cancelTimer();
    disconnectResize();
  }
  function evaluate() {
    if (stopped || !elapsed) return;
    if (!scrolled && viewport.scrollHeight - viewport.clientHeight > 8) return;
    cleanup();
    onReady();
  }
  function onScroll() {
    if (viewport.scrollTop > 8) scrolled = true;
    evaluate();
  }

  const schedule = options.schedule ?? ((callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  });
  const observeResize = options.observeResize ?? ((callback) => {
    if (typeof ResizeObserver === "undefined" || typeof Element === "undefined" || !(viewport instanceof Element)) return () => {};
    const observer = new ResizeObserver(callback);
    observer.observe(viewport);
    for (const child of viewport.children) observer.observe(child);
    return () => observer.disconnect();
  });

  viewport.addEventListener("scroll", onScroll, { passive: true });
  disconnectResize = observeResize(evaluate);
  cancelTimer = schedule(() => { elapsed = true; evaluate(); }, 5000);
  if (stopped) cancelTimer();
  return cleanup;
}
