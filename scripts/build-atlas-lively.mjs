import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = "public/animations/atlas/lively";
const modes = ["welcome", "explaining", "learned", "location", "budget", "guests", "calendar", "clock", "thoughtful"];
const end = 144;
const fixed = (k) => ({ a: 0, k });
const animated = (keys) => ({ a: 1, k: keys.map(([t, s], index) => ({
  t, s,
  ...(index < keys.length - 1 ? { e: keys[index + 1][1], i: { x: [0.65], y: [1] }, o: { x: [0.35], y: [0] } } : {}),
})) });
const first = (property) => property.a === 1 ? property.k[0].s : property.k;
const cycle = (values) => animated(values.map((value, index) => [index * end / (values.length - 1), value]));
const red = [217 / 255, 19 / 255, 53 / 255, 1];
const stroke = { ty: "st", c: fixed(red), o: fixed(100), w: fixed(3), lc: 2, lj: 2 };

mkdirSync(directory, { recursive: true });
for (const [modeIndex, mode] of modes.entries()) {
  const data = JSON.parse(readFileSync(`public/animations/atlas/${mode}.json`, "utf8"));
  data.nm = `Atlas lively — ${mode}`;
  data.op = end;
  data.markers = [{ tm: 0, cm: `lively-${mode}`, dr: end }];
  const direction = modeIndex % 2 ? -1 : 1;
  for (const layer of data.layers) {
    layer.op = end;
    if (layer.nm === "Atlas pose") {
      layer.ks.p = cycle([[250,245,0],[246,231,0],[250,245,0],[254,236,0],[250,245,0],[247,234,0],[250,245,0]]);
      layer.ks.r = cycle([[0],[-6 * direction],[3 * direction],[0],[5 * direction],[-3 * direction],[0]]);
      layer.ks.s = cycle([[100,100,100],[96,104,100],[104,96,100],[100,100,100],[97,103,100],[102,98,100],[100,100,100]]);
    } else if (layer.nm === "Eye") {
      const x = first(layer.ks.p)[0];
      layer.ks.p = cycle([[x,236,0],[x+5*direction,232,0],[x,236,0],[x-4*direction,234,0],[x,236,0]]);
      layer.ks.s = animated([[0,[100,100,100]],[28,[100,100,100]],[31,[100,12,100]],[35,[100,100,100]],[94,[100,100,100]],[97,[100,12,100]],[101,[100,100,100]],[144,[100,100,100]]]);
    } else if (layer.nm === "Expressive brow") {
      const [x, y, z] = first(layer.ks.p);
      const side = x < 250 ? -1 : 1;
      layer.ks.p = cycle([[x,y,z],[x,y-4,z],[x,y,z],[x,y-2,z],[x,y,z]]);
      layer.ks.r = cycle([[0],[side*9],[0],[-side*5],[0]]);
    } else if (layer.nm === "Attentive mouth") {
      layer.ks.s = cycle([[100,100,100],[108,119,100],[100,100,100],[106,112,100],[100,100,100]]);
    } else if (layer.nm.startsWith("Open ")) {
      const side = layer.nm.includes("right") ? 1 : -1;
      const x = 250 + side * 130;
      layer.ks.p = side === direction
        ? cycle([[x,273,0],[x+side*8,245,0],[x+side*10,230,0],[x+side*5,249,0],[x+side*10,238,0],[x+side*5,254,0],[x,273,0]])
        : cycle([[x,273,0],[x-side*5,260,0],[x,270,0],[x-side*3,258,0],[x,273,0]]);
      layer.ks.r = cycle([[side*12],[-side*22],[side*18],[-side*15],[side*12]]);
    } else if (layer.nm === "Signature accentRed dot") {
      layer.ks.p = cycle([[343,120,0],[340,111,0],[345,122,0],[347,113,0],[343,120,0]]);
      layer.ks.s = cycle([[100,100,100],[72,72,100],[110,110,100],[84,84,100],[100,100,100]]);
    } else if (layer.nm === "Context card" || layer.nm === "Context symbol") {
      layer.ks.p = cycle([[355,306,0],[350,294,0],[357,305,0],[352,297,0],[355,306,0]]);
      layer.ks.r = cycle([[-8],[-15],[0],[-12],[-8]]);
      layer.ks.s = cycle([[100,100,100],[106,106,100],[100,100,100],[103,103,100],[100,100,100]]);
    } else if (layer.nm === "Soft oval shadow") {
      layer.ks.s = cycle([[100,100,100],[80,80,100],[100,100,100],[88,88,100],[100,100,100],[84,84,100],[100,100,100]]);
      layer.ks.o = cycle([[8],[5],[8],[6],[8],[5],[8]]);
    } else if (layer.nm === "Brief learning sparkle") {
      const phase = layer.ind % 2 ? 8 : 0;
      layer.ks.o = animated([[0,[0]],[16+phase,[100]],[34+phase,[0]],[68+phase,[0]],[84+phase,[100]],[104+phase,[0]],[144,[0]]]);
      layer.ks.s = cycle([[50,50,100],[110,110,100],[60,60,100],[100,100,100],[50,50,100]]);
      layer.ks.r = cycle([[0],[35],[0],[-35],[0]]);
    }
  }

  const symbol = data.layers.find((layer) => layer.nm === "Context symbol");
  if (symbol && mode === "clock") {
    const hands = structuredClone(symbol);
    hands.ind = 200;
    hands.nm = "Clock hands in motion";
    hands.shapes = symbol.shapes.filter((shape) => shape.ty === "sh" || shape.ty === "st");
    hands.ks.r = cycle([[-8],[82],[172],[262],[352]]);
    symbol.shapes = symbol.shapes.filter((shape) => shape.ty !== "sh");
    data.layers.unshift(hands);
  }
  if (symbol && mode === "location") {
    const ring = structuredClone(symbol);
    ring.ind = 201;
    ring.nm = "Location ripple";
    ring.shapes = [{ ty: "el", p: fixed([0,-3]), s: fixed([40,40]) }, { ...stroke, w: fixed(2) }];
    ring.ks.s = cycle([[60,60,100],[145,145,100],[60,60,100],[145,145,100],[60,60,100]]);
    ring.ks.o = animated([[0,[0]],[12,[55]],[36,[0]],[72,[0]],[84,[55]],[108,[0]],[144,[0]]]);
    data.layers.unshift(ring);
  }
  if (symbol && mode === "budget") {
    const coin = structuredClone(symbol);
    coin.ind = 202;
    coin.nm = "Budget coin bounce";
    coin.shapes = [{ ty: "el", p: fixed([0,0]), s: fixed([12,12]) }, { ty: "fl", c: fixed(red), o: fixed(100), r: 1 }];
    coin.ks.p = cycle([[355,292,0],[350,272,0],[357,292,0],[352,278,0],[355,292,0]]);
    data.layers.unshift(coin);
  }
  if (symbol && mode === "calendar") {
    const tick = structuredClone(symbol);
    tick.ind = 203;
    tick.nm = "Calendar choice";
    tick.shapes = [{ ty: "sh", ks: fixed({ v: [[-8,2],[-2,8],[11,-7]], i: [[0,0],[0,0],[0,0]], o: [[0,0],[0,0],[0,0]], c: false }) }, stroke];
    tick.ks.s = cycle([[80,80,100],[110,110,100],[80,80,100],[110,110,100],[80,80,100]]);
    data.layers.unshift(tick);
  }
  writeFileSync(`${directory}/${mode}.json`, JSON.stringify(data));
}
