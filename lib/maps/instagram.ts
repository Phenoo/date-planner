const instagramHosts = new Set(["instagram.com", "www.instagram.com"]);
const reservedPaths = new Set([
  "about", "accounts", "api", "blog", "challenge", "create", "developer", "developers",
  "direct", "directory", "emails", "explore", "graphql", "legal", "login", "oauth",
  "p", "press", "privacy", "reel", "reels", "settings", "share", "signup", "stories",
  "terms", "tv", "web",
]);

export function instagramProfileUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !instagramHosts.has(url.hostname) || url.username || url.password || url.port) return undefined;
    const username = /^\/([a-z0-9._]{1,30})\/?$/i.exec(url.pathname)?.[1].toLowerCase();
    if (!username || username.startsWith(".") || username.endsWith(".") || username.includes("..") || reservedPaths.has(username)) return undefined;
    return `https://www.instagram.com/${username}/`;
  } catch {
    return undefined;
  }
}
