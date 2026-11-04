import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = "public/animations/atlas";
const palettes = {
  red: { D91335: "FFFFFF", 261014: "AD0D2A", FF8197: "F5A4B6", FFE4E9: "F6B7C5", FFFFFF: "AD0D2A" },
  dark: { D91335: "FFADC4", 261014: "341D2C", FF8197: "D55F85", FFE4E9: "6E425B", FFFFFF: "432D3B" },
};
const sources = ["", "lively"].flatMap((folder) => readdirSync(join(root, folder)).filter((file) => file.endsWith(".json")).map((file) => join(folder, file)));

function recolor(value, palette) {
  if (Array.isArray(value)) { value.forEach((item) => recolor(item, palette)); return; }
  if (!value || typeof value !== "object") return;
  if (value.ty === "fl" || value.ty === "st") {
    if (value.c?.a !== 0 || !Array.isArray(value.c.k)) throw new Error("Heart themes need a static source color.");
    const source = value.c.k.slice(0, 3).map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    const target = palette[source];
    if (!target) throw new Error(`Missing heart theme color: ${source}`);
    value.c.k = [...target.match(/\w\w/g).map((channel) => parseInt(channel, 16) / 255), value.c.k[3] ?? 1];
  }
  Object.values(value).forEach((item) => recolor(item, palette));
}

for (const [theme, palette] of Object.entries(palettes)) for (const source of sources) {
  const animation = JSON.parse(readFileSync(join(root, source), "utf8"));
  recolor(animation, palette);
  animation.nm = `${animation.nm} — ${theme} theme`;
  const output = join(root, "themed", theme, source);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(animation));
}
