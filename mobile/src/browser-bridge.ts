import type { Surface } from "./web-origin";

export type BrowserAction =
  | { type: "location"; id: string }
  | { type: "google"; id: string; sessionId: string }
  | { type: "share"; id: string; title?: string; text?: string; url?: string }
  | { type: "copy"; id: string; text: string }
  | { type: "calendar"; id: string; calendar: string };

type BrowserMessage = BrowserAction | { type: "surface"; surface: Surface };

export function readBrowserMessage(raw: string): BrowserMessage | null {
  if (raw.length > 32000) return null;
  try {
    const message: unknown = JSON.parse(raw);
    if (!message || typeof message !== "object" || !("type" in message)) return null;
    if (message.type === "surface" && "color" in message && typeof message.color === "string") {
      const match = /^rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)$/.exec(message.color);
      if (!match) return null;
      const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);
      if (Math.max(r, g, b) > 255) return null;
      return { type: "surface", surface: { color: `rgb(${r},${g},${b})`, dark: r * 0.299 + g * 0.587 + b * 0.114 < 150, chat: "chat" in message && message.chat === true } };
    }
    if (!("id" in message) || typeof message.id !== "string" || !/^\d{1,16}:\d{1,8}$/.test(message.id)) return null;
    const { id, type } = message;
    if (type === "location") return { type, id };
    if (type === "google" && "sessionId" in message && typeof message.sessionId === "string" && /^[a-f0-9]{64}$/.test(message.sessionId)) return { type, id, sessionId: message.sessionId };
    if (type === "copy" && "text" in message && typeof message.text === "string") return { type, id, text: message.text };
    if (type === "calendar" && "calendar" in message && typeof message.calendar === "string"
      && message.calendar.startsWith("BEGIN:VCALENDAR") && message.calendar.trimEnd().endsWith("END:VCALENDAR")) {
      return { type, id, calendar: message.calendar };
    }
    if (type === "share") {
      const title = "title" in message && typeof message.title === "string" ? message.title : undefined;
      const text = "text" in message && typeof message.text === "string" ? message.text : undefined;
      const url = "url" in message && typeof message.url === "string" ? message.url : undefined;
      if (text || url) return { type, id, title, text, url };
    }
  } catch {
    // Ignore messages outside the bridge protocol.
  }
  return null;
}

export function browserScript(origin: string) {
  return `(() => {
    if (location.origin !== ${JSON.stringify(origin)} || window.__dateAtlasNative) return;
    window.__dateAtlasNative = true;
    const post = (data) => window.ReactNativeWebView.postMessage(JSON.stringify(data));
    const pending = new Map();
    const page = Date.now();
    let sequence = 0;
    function request(type, data) {
      return new Promise((resolve, reject) => {
        const id = page + ':' + ++sequence;
        pending.set(id, { resolve, reject });
        post({ ...data, type, id });
      });
    }
    window.addEventListener('dateatlas:native-result', ({ detail }) => {
      const call = pending.get(detail.id);
      if (!call) return;
      pending.delete(detail.id);
      if (detail.locationError) call.reject(detail.locationError);
      else if (detail.error) call.reject(new DOMException('The action did not finish.', detail.error));
      else call.resolve(detail.coordinates ?? detail.code);
    });

    Object.defineProperty(navigator, 'share', { configurable: true, value: (data) => request('share', data) });
    const copy = (text) => request('copy', { text });
    if (navigator.clipboard) navigator.clipboard.writeText = copy;
    else Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });

    function calendar(url) {
      fetch(url).then((response) => {
        if (!response.ok) throw new Error('Calendar unavailable.');
        return response.text();
      }).then((calendar) => request('calendar', { calendar })).catch((error) => {
        if (!(error instanceof DOMException)) alert('Couldn’t download the calendar file. Try again in a moment.');
      });
    }
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      // The saved-date download uses a detached anchor, so its click does not bubble to the document.
      if (this.download === 'our-date.ics' && this.href.startsWith('blob:' + location.origin + '/')) calendar(this.href);
      else click.call(this);
    };
    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element && event.target.closest('a[href]');
      if (!link || event.defaultPrevented || link.origin !== location.origin || !/^\\/api\\/invitations\\/[^/]+\\/calendar$/.test(link.pathname)) return;
      event.preventDefault();
      calendar(link.href);
    });
    window.addEventListener('dateatlas:calendar', (event) => calendar(event.detail));

    window.addEventListener('dateatlas:google-sign-in', ({ detail }) => {
      if (!detail || typeof detail.sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(detail.sessionId)) return;
      const result = (error, code) => window.dispatchEvent(new CustomEvent('dateatlas:google-sign-in-result', { detail: { sessionId: detail.sessionId, error, code } }));
      request('google', { sessionId: detail.sessionId }).then(code => result(undefined, code), error => result(error.name));
    });
    window.addEventListener('dateatlas:location', ({ detail }) => {
      if (!detail || typeof detail.requestId !== 'string' || detail.requestId.length > 80) return;
      const result = (data) => window.dispatchEvent(new CustomEvent('dateatlas:location-result', { detail: { requestId: detail.requestId, ...data } }));
      request('location', {}).then(coordinates => result({ coordinates }), error => result({ error: { code: typeof error.code === 'number' ? error.code : 2, message: error.message } }));
    });
    window.__dateAtlasNativeLocation = true;
    window.__dateAtlasNativeAuth = true;
    window.dispatchEvent(new Event('dateatlas:native-ready'));

    const root = document.documentElement;
    let previousColor;
    let previousChat;
    let frame = 0;
    function updateSurface() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // The white welcome screen covers the red document background during its animation.
        let node = document.elementFromPoint(1, 1);
        const chat = !!node?.closest('.is-planning[data-planner-mode="chat"]');
        while (node) {
          const color = getComputedStyle(node).backgroundColor;
          if (color.startsWith('rgb(')) {
            if (color !== previousColor || chat !== previousChat) post({ type: 'surface', color, chat });
            previousColor = color;
            previousChat = chat;
            break;
          }
          node = node.parentElement;
        }
      });
    }
    new MutationObserver(updateSurface).observe(root, {
      subtree: true, childList: true, attributeFilter: ['data-page-surface', 'data-planner-appearance', 'data-planner-mode', 'class'],
    });
    addEventListener('scroll', updateSurface, { passive: true });
    addEventListener('resize', updateSurface);
    updateSurface();
  })(); true;`;
}
