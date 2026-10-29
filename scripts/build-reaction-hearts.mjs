import { mkdirSync, writeFileSync } from "node:fs";

const directory = "public/animations/reaction-hearts";
const fixed = (k) => ({ a: 0, k });
const animated = (keys) => ({ a: 1, k: keys.map(([t, s], index) => ({ t, s, ...(index < keys.length - 1 ? { e: keys[index + 1][1], i: { x: [0.65], y: [1] }, o: { x: [0.35], y: [0] } } : {}) })) });
const heart = { v: [[0,-19],[-52,0],[0,56],[52,0]], i: [[24,-34],[-12,-33],[-14,-13],[6,20]], o: [[-24,-34],[6,20],[14,-13],[12,-33]], c: true };
const path = "M0-19C-24-53-64-33-52 0C-46 20-14 43 0 56C14 43 46 20 52 0C64-33 24-53 0-19Z";
const themes = { white: "#d91335", red: "#ffffff", dark: "#ff9caf" };

mkdirSync(directory, { recursive: true });
for (const [theme, hex] of Object.entries(themes)) {
  const color = [...hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255), 1];
  const layers = [
    { x: 97, y: 65, scale: 72, rotation: -12, delay: 0 },
    { x: 154, y: 80, scale: 45, rotation: 14, delay: 10 },
  ].map(({ x, y, scale, rotation, delay }, index) => ({
    ddd: 0, ind: index + 1, ty: 4, nm: `Hand-drawn heart ${index + 1}`, sr: 1,
    ks: { o: fixed(100), a: fixed([0,0,0]), p: animated([[0,[x,y,0]],[32,[x,y-5,0]],[64,[x,y+2,0]],[96,[x,y,0]]]), s: animated([[0,[scale,scale,100]],[48,[scale+3,scale+3,100]],[96,[scale,scale,100]]]), r: animated([[0,[rotation]],[48,[rotation+5]],[96,[rotation]]]) },
    shapes: [
      { ty: "sh", ks: fixed(heart) },
      { ty: "st", c: fixed(color), o: fixed(index ? 65 : 100), w: fixed(3.5), lc: 2, lj: 2 },
      { ty: "tm", s: fixed(0), e: animated([...(delay ? [[0,[0]]] : []),[delay,[0]],[34+delay,[100]],[96,[100]]]), o: fixed(0), m: 1 },
    ], ip: 0, op: 96, st: 0, bm: 0,
  }));
  writeFileSync(`${directory}/${theme}.json`, JSON.stringify({ v: "5.12.2", fr: 30, ip: 0, op: 96, w: 240, h: 160, nm: "A little connection", ddd: 0, assets: [], layers }));
  writeFileSync(`${directory}/${theme}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><g fill="none" stroke="${hex}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" transform="translate(97 65) rotate(-12) scale(.72)"/><path d="${path}" opacity=".65" transform="translate(154 80) rotate(14) scale(.45)"/></g></svg>`);
}
