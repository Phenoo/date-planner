import { mkdirSync, writeFileSync } from "node:fs";

const fixed = (k) => ({ a: 0, k });
const frames = (values) => ({ a: 1, k: values.map((s, index) => ({ t: index * 144 / (values.length - 1), s, ...(index < values.length - 1 ? { e: values[index + 1], i: { x: [.65], y: [1] }, o: { x: [.35], y: [0] } } : {}) })) });
const rgb = (hex) => [...hex.match(/\w\w/g).map((part) => parseInt(part, 16) / 255), 1];
const fill = (hex) => ({ ty: "fl", c: fixed(rgb(hex)), o: fixed(100), r: 1 });
const line = (hex, width = 2) => ({ ty: "st", c: fixed(rgb(hex)), o: fixed(100), w: fixed(width), lc: 2, lj: 2 });
const ellipse = (x, y, w, h) => ({ ty: "el", p: fixed([x, y]), s: fixed([w, h]) });
const rect = (x, y, w, h, radius = 0) => ({ ty: "rc", p: fixed([x, y]), s: fixed([w, h]), r: fixed(radius) });
const path = (v, closed = false, incoming, outgoing) => ({ ty: "sh", ks: fixed({ v, i: incoming ?? v.map(() => [0, 0]), o: outgoing ?? v.map(() => [0, 0]), c: closed }) });
const heart = (x, y, size) => path([[x,y+size*.7],[x-size,y],[x-size*.6,y-size*.6],[x,y-size*.25],[x+size*.6,y-size*.6],[x+size,y]], true, [[size*.35,-size*.3],[0,size*.3],[-size*.3,0],[-size*.1,-size*.3],[-size*.3,-size*.1],[0,-size*.3]], [[-size*.35,-size*.3],[0,-size*.3],[size*.3,-size*.1],[size*.1,-size*.3],[size*.3,0],[0,size*.3]]);
const themes = {
  white: { shirt: "D91335", trim: "FFFFFF", pants: "34303C", accent: "D91335", card: "FFF0F3", ink: "442630" },
  red: { shirt: "FFE3E8", trim: "C11637", pants: "60293C", accent: "B50F30", card: "FFF5F6", ink: "442630" },
  dark: { shirt: "EE9FB5", trim: "3B2130", pants: "B6AACB", accent: "FFADC4", card: "432D3B", ink: "FFEAF1" },
};
const modes = ["welcome", "idle", "explaining", "learned", "thoughtful", "attentive", "still", "location", "budget", "guests", "calendar", "clock"];
for (const [theme, palette] of Object.entries(themes)) {
  const directory = `public/animations/atlas/human/${theme}`;
  mkdirSync(directory, { recursive: true });
  for (const mode of modes) {
    const waving = mode === "welcome" || mode === "guests";
    const celebrating = mode === "learned";
    const thinking = mode === "thoughtful" || mode === "attentive";
    let id = 0;
    const layers = [];
    const add = (nm, shapes, p = [0, 0, 0], extra = {}, parent = 1000) => {
      const layer = { ddd: 0, ind: ++id, ty: 4, nm, sr: 1, ...(parent ? { parent } : {}), ks: { o: fixed(100), r: fixed(0), p: fixed(p), a: fixed([0, 0, 0]), s: fixed([100, 100, 100]), ...extra }, shapes, ip: 0, op: 144, st: 0, bm: 0 };
      layers.push(layer);
      return layer;
    };
    const parent = (ind, nm, point, motion, root = 1000) => layers.push({ ddd: 0, ind, ty: 3, nm, sr: 1, ...(root ? { parent: root } : {}), ks: { o: fixed(100), r: motion ?? fixed(0), p: fixed(point), a: fixed([0,0,0]), s: fixed([100,100,100]) }, ip: 0, op: 144, st: 0 });
    add("Soft oval shadow", [ellipse(0,0,78,11),fill("6E4050")], [180,321,0], { o: fixed(10), s: frames([[100,100,100],[86,86,100],[100,100,100],[90,90,100],[100,100,100]]) }, null);
    for (const side of [-1, 1]) {
      const pivot = side === -1 ? 2100 : 2200;
      parent(pivot, side === -1 ? "Left leg joint" : "Right leg joint", [180+side*16,236,0], frames([[side*1],[-side*2],[side*1],[-side],[side*1]]));
      add(side === -1 ? "Left trouser leg" : "Right trouser leg", [rect(0,31,25,65,8),fill(palette.pants)], [0,0,0], {}, pivot);
      add("Little sneaker", [path([[-12,58],[9,58],[20,69],[20,75],[-13,75]],true),fill("342331")], [0,0,0], {}, pivot);
      add("Sneaker sole", [path([[-12,73],[18,73]]),line("FFF5F5",3)], [0,0,0], {}, pivot);
    }
    add("Neck", [rect(180,165,19,29,7),fill("AE6D47")]);
    add("Shirt", [path([[153,172],[207,172],[220,237],[140,237]],true,[[0,0],[0,0],[0,0],[0,0]],[[0,0],[8,8],[0,0],[-2,-8]]),fill(palette.shirt),line(theme === "red" ? "B94D65" : palette.shirt,1.5)]);
    add("Shirt hem", [path([[143,234],[217,234]]),line(palette.trim,2)]);
    add("Collar", [path([[166,174],[180,182],[194,174]],false,[[0,0],[-5,0],[-4,6]],[[4,6],[5,0],[0,0]]),line(palette.trim,2)]);
    add("Heart pocket", [heart(184,199,8),fill(palette.trim)]);
    for (const side of [-1, 1]) {
      const pivot = side === -1 ? 3100 : 3200;
      const resting = side === 1 ? -12 : 8;
      const rotations = side === 1 && waving ? [[-70],[-105],[-80],[-105],[-70]] : celebrating ? [[-side*55],[-side*95],[-side*55],[-side*85],[-side*55]] : side === -1 && thinking ? [[20],[43],[20],[35],[20]] : [[resting],[resting-side*8],[resting],[resting-side*4],[resting]];
      parent(pivot, side === 1 ? "Right shoulder joint" : "Left shoulder joint", [180+side*32,181,0], frames(rotations));
      add("Sleeve outline", [path([[0,0],[side*13,23]]),line(theme === "red" ? "B94D65" : palette.shirt,23)], [0,0,0], {}, pivot);
      add("Shirt sleeve", [path([[0,0],[side*13,23]]),line(palette.shirt,21)], [0,0,0], {}, pivot);
      add("Forearm", [path([[side*13,24],[side*24,45]]),line("BD8058",13)], [0,0,0], {}, pivot);
      add("Open human hand", [ellipse(side*26,51,18,22),fill("BD8058")], [0,0,0], {}, pivot);
      for (let finger=0;finger<3;finger++) add("Fingers", [path([[side*(19+finger*5),49],[side*(19+finger*5),40-finger%2*3]]),line("BD8058",5)], [0,0,0], {}, pivot);
      add("Thumb", [path([[side*20,56],[side*13,49]]),line("BD8058",6)], [0,0,0], {}, pivot);
    }
    parent(2000, "Head turn", [180,124,0], frames(thinking ? [[-4],[6],[-4],[3],[-4]] : [[0],[-3],[0],[3],[0]]));
    add("Left ear", [ellipse(-35,3,13,20),fill("B5754E")], [0,0,0], {},2000);
    add("Right ear", [ellipse(35,3,13,20),fill("B5754E")], [0,0,0], {},2000);
    add("Human face", [ellipse(0,0,69,83),fill("C38A61")], [0,0,0], {},2000);
    add("Hair silhouette", [path([[-35,-3],[-38,-29],[-24,-44],[0,-48],[26,-41],[38,-25],[33,-3],[26,-24],[-15,-22],[-29,-12]],true),fill("32212C")], [0,0,0], {},2000);
    for(const [x,y,r] of [[-29,-30,12],[-15,-41,13],[1,-45,13],[17,-40,13],[29,-30,12]]) add("Soft curls", [ellipse(x,y,r*2,r*2),fill("32212C")], [0,0,0], {},2000);
    for(const side of [-1,1]) {
      add("Expressive brow", [path([[side*11,-9],[side*21,-8]],false,[[0,0],[0,-2]],[[0,-2],[0,0]]),line("442630",2.3)], [0,0,0], {},2000);
      add("Blinking eye", [ellipse(0,0,4,6.5),fill("33202B")], [side*16,2,0], { s: { a:1,k:[[0,[100,100,100]],[42,[100,100,100]],[45,[100,8,100]],[49,[100,100,100]],[109,[100,100,100]],[112,[100,8,100]],[116,[100,100,100]],[144,[100,100,100]]].map(([t,s],n,a)=>({t,s,...(n<a.length-1?{e:a[n+1][1],i:{x:[.65],y:[1]},o:{x:[.35],y:[0]}}:{})})) } },2000);
      add("Warm cheek", [ellipse(side*26,14,10,5),fill("D97979")], [0,0,0], {o:fixed(45)},2000);
    }
    add("Nose", [path([[0,5],[-2,13],[2,13]]),line("8D533B",1.5)], [0,0,0], {},2000);
    add("Smile", [path([[-10,0],[10,0]],false,[[0,0],[-5,7]],[[5,7],[0,0]]),line("442630",2.2)], [0,23,0], {s:frames([[100,100,100],[110,135,100],[100,100,100],[105,115,100],[100,100,100]])},2000);
    if(mode !== "idle" && mode !== "still") {
      const float = {p:frames([[86,220,0],[83,211,0],[86,220,0],[90,215,0],[86,220,0]]),r:frames([[-6],[3],[-6],[-2],[-6]])};
      add("Context card", [rect(0,0,52,53,12),fill(palette.card)], [0,0,0],float);
      if(mode === "budget") {
        add("A little coin", [ellipse(0,0,28,28),line(palette.accent,2.5)], [0,0,0],float);
        add("Coin detail", [path([[0,-8],[0,8],[-5,4],[5,-4]]),line(palette.accent,2)], [0,0,0],float);
      } else if(mode === "clock") {
        add("Clock", [ellipse(0,0,29,29),line(palette.accent,2.5)], [0,0,0],float);
        add("Clock hands", [path([[0,-9],[0,0],[7,4]]),line(palette.accent,2)], [0,0,0],float);
      } else if(mode === "calendar") {
        add("Calendar", [rect(0,0,29,29,4),line(palette.accent,2.5)], [0,0,0],float);
        add("Calendar lines", [path([[-14,-6],[14,-6],[14,-6],[-6,3],[-1,8],[7,-1]]),line(palette.accent,2)], [0,0,0],float);
      } else if(mode === "location") {
        add("Location circle", [ellipse(0,-4,20,20),line(palette.accent,2.5)], [0,0,0],float);
        add("Location tip", [path([[-8,3],[0,16],[8,3]]),line(palette.accent,2.5)], [0,0,0],float);
      } else add("A little love", [heart(0,-1,14),fill(palette.accent)], [0,0,0],float);
    }
    const root = {ddd:0,ind:1000,ty:3,nm:"Atlas human body",sr:1,ks:{o:fixed(100),r:frames([[0],[-1.5],[0],[1.5],[0]]),p:frames([[180,180,0],[180,celebrating?172:177,0],[180,180,0],[180,177,0],[180,180,0]]),a:fixed([180,180,0]),s:fixed([100,100,100])},ip:0,op:144,st:0};
    const data = {v:"5.12.2",fr:30,ip:0,op:144,w:360,h:360,nm:`Atlas human ${theme} — ${mode}`,ddd:0,assets:[],layers:[...layers.reverse(),root],markers:[{tm:0,cm:`human-${theme}-${mode}`,dr:144}]};
    writeFileSync(`${directory}/${mode}.json`,JSON.stringify(data));
  }
}
