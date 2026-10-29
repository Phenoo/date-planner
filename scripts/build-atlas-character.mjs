import { mkdirSync, writeFileSync } from "node:fs";

// Shape-only Lottie assets keep the character editable and independent of fonts.
const fixed = (k) => ({ a: 0, k });
const animated = (keys) => ({
  a: 1,
  k: keys.map(([t, s], n) => ({
    t,
    s,
    ...(n < keys.length - 1
      ? {
          e: keys[n + 1][1],
          i: { x: [0.65], y: [1] },
          o: { x: [0.35], y: [0] },
        }
      : {}),
  })),
});
const color = (hex) => [
  ...hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255),
  1,
];
const brandRed = color("D91335");
const espresso = color("261014");
const accentRed = color("D91335");
const fill = (c) => ({ ty: "fl", c: fixed(c), o: fixed(100), r: 1 });
const stroke = (c, w) => ({
  ty: "st",
  c: fixed(c),
  o: fixed(100),
  w: fixed(w),
  lc: 2,
  lj: 2,
});
const ellipse = (p, s, c) => [{ ty: "el", p: fixed(p), s: fixed(s) }, fill(c)];
const curve = (v, i, o, c = false) => ({ ty: "sh", ks: fixed({ v, i, o, c }) });
const body = curve(
  [[-91,-53],[-46,-94],[49,-92],[101,-48],[105,22],[62,68],[0,115],[-62,68],[-106,18]],
  [[-16,24],[-27,0],[-32,-8],[-8,-27],[7,-25],[22,-10],[20,-25],[20,10],[0,25]],
  [[9,-24],[30,-7],[27,5],[12,27],[-8,26],[-15,9],[-20,-25],[-25,-15],[-8,-25]], true,
);
const smile = (neutral) =>
  curve(
    [
      [-13, 18],
      [13, 18],
    ],
    [
      [0, 0],
      [-8, neutral ? 1 : 10],
    ],
    [
      [8, neutral ? 1 : 10],
      [0, 0],
    ],
  );
const hand = curve(
  [
    [-12, 5],
    [-9, -11],
    [0, -17],
    [11, -8],
    [13, 7],
    [0, 14],
  ],
  [
    [0, 0],
    [-4, 5],
    [-5, -1],
    [-3, -5],
    [2, -6],
    [7, 0],
  ],
  [
    [-2, -5],
    [2, -6],
    [5, 0],
    [3, 5],
    [-3, 6],
    [-7, 0],
  ],
  true,
);
const question = curve(
  [
    [-10, -8],
    [0, -19],
    [13, -9],
    [3, 5],
    [3, 12],
  ],
  [
    [0, 0],
    [-7, 0],
    [0, -6],
    [0, -7],
    [0, 0],
  ],
  [
    [0, -7],
    [8, 0],
    [0, 9],
    [0, 4],
    [0, 0],
  ],
);
const modes = {
  welcome: 120,
  idle: 180,
  explaining: 120,
  learned: 90,
  thoughtful: 120,
  attentive: 1,
  still: 1,
  location: 120,
  budget: 120,
  guests: 120,
  calendar: 120,
  clock: 120,
};
mkdirSync("public/animations/atlas", { recursive: true });

for (const [mode, end] of Object.entries(modes)) {
  let id = 0;
  const track = (keys, fallback) => (keys ? animated(keys) : fixed(fallback));
  const make = (nm, shapes, ks = {}, parent = 100) => ({
    ddd: 0,
    ind: ++id,
    ty: 4,
    nm,
    sr: 1,
    ...(parent ? { parent } : {}),
    ks: {
      o: fixed(100),
      r: fixed(0),
      p: fixed([250, 245, 0]),
      a: fixed([0, 0, 0]),
      s: fixed([100, 100, 100]),
      ...ks,
    },
    ao: 0,
    shapes,
    ip: 0,
    op: end,
    st: 0,
    bm: 0,
  });
  const welcome = mode === "welcome",
    idle = mode === "idle",
    explaining = ["explaining", "location", "budget", "guests", "calendar", "clock"].includes(mode),
    learned = mode === "learned",
    thoughtful = mode === "thoughtful",
    neutral = mode === "attentive";
  const pose = {
    o: fixed(100),
    r: track(
      welcome
        ? [
            [0, [0]],
            [34, [0]],
            [47, [-5]],
            [62, [0]],
            [120, [0]],
          ]
        : thoughtful
          ? [
              [0, [0]],
              [30, [-7]],
              [75, [-7]],
              [120, [0]],
            ]
          : explaining
            ? [
                [0, [0]],
                [35, [4]],
                [85, [4]],
                [120, [0]],
              ]
            : null,
      0,
    ),
    p: track(
      welcome
        ? [
            [0, [250, 310, 0]],
            [22, [250, 241, 0]],
            [32, [250, 249, 0]],
            [43, [250, 245, 0]],
            [120, [250, 245, 0]],
          ]
        : idle
          ? [
              [0, [250, 245, 0]],
              [90, [250, 242, 0]],
              [180, [250, 245, 0]],
            ]
          : learned
            ? [
                [0, [250, 245, 0]],
                [22, [250, 234, 0]],
                [40, [250, 247, 0]],
                [55, [250, 245, 0]],
                [90, [250, 245, 0]],
              ]
            : null,
      [250, 245, 0],
    ),
    a: fixed([250, 245, 0]),
    s: track(
      welcome
        ? [
            [0, [96, 104, 100]],
            [22, [100, 100, 100]],
            [29, [104, 96, 100]],
            [43, [100, 100, 100]],
            [120, [100, 100, 100]],
          ]
        : null,
      [100, 100, 100],
    ),
  };
  const parent = {
    ddd: 0,
    ind: 100,
    ty: 3,
    nm: "Atlas pose",
    sr: 1,
    ks: pose,
    ip: 0,
    op: end,
    st: 0,
  };
  const blink = welcome
    ? [
        [0, [100, 100, 100]],
        [34, [100, 100, 100]],
        [37, [100, 12, 100]],
        [40, [100, 100, 100]],
        [120, [100, 100, 100]],
      ]
    : idle
      ? [
          [0, [100, 100, 100]],
          [116, [100, 100, 100]],
          [119, [100, 12, 100]],
          [123, [100, 100, 100]],
          [180, [100, 100, 100]],
        ]
      : null;
  const layers = [parent];
  for (const x of [-28, 28]) {
    layers.push(
      make("Eye", ellipse([0, 0], [9, 13], espresso), {
        p: track(
          welcome
            ? [
                [0, [250 + x, 236, 0]],
                [70, [250 + x, 236, 0]],
                [82, [255 + x, 230, 0]],
                [94, [255 + x, 230, 0]],
                [108, [250 + x, 236, 0]],
                [120, [250 + x, 236, 0]],
              ]
            : null,
          [250 + x, 236, 0],
        ),
        s: track(blink, [100, 100, 100]),
      }),
    );
    layers.push(
      make(
        "Expressive brow",
        [
          curve(
            [
              [-7, 0],
              [7, -1],
            ],
            [
              [0, 0],
              [-4, -2],
            ],
            [
              [4, -2],
              [0, 0],
            ],
          ),
          stroke(espresso, 3),
        ],
        {
          p: fixed([250 + x, 214 + (thoughtful && x < 0 ? -3 : 0), 0]),
          r: fixed(thoughtful ? (x < 0 ? -9 : 7) : 0),
        },
      ),
    );
  }
  layers.push(make("Attentive mouth", [smile(neutral), stroke(espresso, 3.5)]));
  layers.push(make("Left blush", ellipse([-48,16], [23,10], color("FF8197")), { o: fixed(65) }));
  layers.push(make("Right blush", ellipse([48,16], [23,10], color("FF8197")), { o: fixed(65) }));
  layers.push(make("Atlas location-pin silhouette", [body, fill(brandRed)]));
  for (const side of [-1, 1]) {
    const rest = [250 + side * 130, 273, 0];
    const motion = welcome
      ? side === 1
        ? [
            [0, rest],
            [42, rest],
            [54, [391, 230, 0]],
            [75, [391, 230, 0]],
            [98, [389, 265, 0]],
            [120, rest],
          ]
        : [
            [0, rest],
            [86, rest],
            [101, [111, 265, 0]],
            [120, rest],
          ]
      : explaining && side === 1
        ? [
            [0, rest],
            [35, [397, 256, 0]],
            [85, [397, 256, 0]],
            [120, rest],
          ]
        : thoughtful && side === -1
          ? [
              [0, rest],
              [35, [115, 265, 0]],
              [85, [115, 265, 0]],
              [120, rest],
            ]
          : null;
    layers.push(
      make(
        side === 1 ? "Open right hand" : "Open left hand",
        [hand, fill(brandRed)],
        {
          p: track(motion, rest),
          r: track(
            welcome && side === 1
              ? [
                  [0, [12]],
                  [48, [12]],
                  [58, [-14]],
                  [68, [18]],
                  [78, [0]],
                  [100, [35]],
                  [120, [12]],
                ]
              : null,
            side * 12,
          ),
        },
      ),
    );
  }
  const dotPos = idle
    ? [
        [0, [343, 120, 0]],
        [90, [346, 116, 0]],
        [180, [343, 120, 0]],
      ]
    : null;
  layers.push(
    make(
      "Signature accentRed dot",
      ellipse([0, 0], [15, 15], accentRed),
      {
        p: track(dotPos, [343, 120, 0]),
        s: track(
          welcome
            ? [
                [0, [100, 100, 100]],
                [67, [100, 100, 100]],
                [82, [58, 58, 100]],
                [96, [58, 58, 100]],
                [115, [100, 100, 100]],
                [120, [100, 100, 100]],
              ]
            : null,
          [100, 100, 100],
        ),
      },
    ),
  );
  if (welcome)
    layers.push(
      make("Curious question", [question, stroke(accentRed, 5)], {
        p: fixed([340, 87, 0]),
        o: animated([
          [0, [0]],
          [67, [0]],
          [82, [100]],
          [96, [100]],
          [115, [0]],
          [120, [0]],
        ]),
        s: animated([
          [0, [80, 80, 100]],
          [67, [80, 80, 100]],
          [82, [100, 100, 100]],
          [120, [100, 100, 100]],
        ]),
      }),
    );
  if (learned)
    for (const [x, y, t] of [
      [120, 154, 0],
      [380, 179, 8],
    ])
      layers.push(
        make(
          "Brief learning sparkle",
          [
            curve(
              [
                [0, -11],
                [3, -3],
                [11, 0],
                [3, 3],
                [0, 11],
                [-3, 3],
                [-11, 0],
                [-3, -3],
              ],
              Array(8).fill([0, 0]),
              Array(8).fill([0, 0]),
              true,
            ),
            fill(accentRed),
          ],
          {
            p: fixed([x, y, 0]),
            o: animated([
              [0, [0]],
              [14 + t, [0]],
              [24 + t, [100]],
              [40 + t, [100]],
              [54 + t, [0]],
              [90, [0]],
            ]),
            s: animated([
              [0, [50, 50, 100]],
              [24 + t, [100, 100, 100]],
              [54 + t, [70, 70, 100]],
              [90, [70, 70, 100]],
            ]),
          },
        ),
      );
  layers.push(
    make(
      "Soft oval shadow",
      ellipse([0, 0], [124, 12], espresso),
      { p: fixed([250, 378, 0]), o: fixed(8) },
      null,
    ),
  );
  const propModes = ["location", "budget", "guests", "calendar", "clock"];
  if (propModes.includes(mode)) {
    const card = [{ty:"rc",p:fixed([0,0]),s:fixed([82,65]),r:fixed(14)},fill(color("FFFFFF")),stroke(color("D91335"),3)];
    layers.unshift(make("Context card", card, {p: fixed([355,306,0]),r: fixed(-8)}));
    let marks;
    if (mode === "budget") marks = [{ty:"rc",p:fixed([0,0]),s:fixed([46,30]),r:fixed(6)},stroke(brandRed,3),...ellipse([13,0],[5,5],brandRed)];
    else if (mode === "clock") marks = [...ellipse([0,0],[37,37],color("FFE4E9")),curve([[0,-13],[0,0],[10,6]],[[0,0],[0,0],[0,0]],[[0,0],[0,0],[0,0]]),stroke(brandRed,3)];
    else if (mode === "guests") marks = [...ellipse([-12,-5],[13,13],brandRed),...ellipse([12,-5],[13,13],brandRed),curve([[-21,16],[-12,7],[0,16],[12,7],[21,16]],Array(5).fill([0,0]),Array(5).fill([0,0])),stroke(brandRed,3)];
    else if (mode === "calendar") marks = [{ty:"rc",p:fixed([0,0]),s:fixed([40,37]),r:fixed(5)},stroke(brandRed,3),curve([[-19,-7],[19,-7]],[[0,0],[0,0]],[[0,0],[0,0]]),stroke(brandRed,3)];
    else marks = [...ellipse([0,-3],[23,23],brandRed),curve([[-9,7],[0,19],[9,7]],Array(3).fill([0,0]),Array(3).fill([0,0])),fill(brandRed)];
    layers.unshift(make("Context symbol",marks,{p:fixed([355,306,0]),r:fixed(-8)}));
  }
  for (const layer of layers) if (!layer.parent) layer.parent = 9999;
  layers.push({ddd:0,ind:9999,ty:3,nm:"Atlas composition",sr:1,ks:{o:fixed(100),r:fixed(0),p:fixed([-70,-60,0]),a:fixed([0,0,0]),s:fixed([100,100,100])},ip:0,op:end,st:0});
  const data = {
    v: "5.12.2",
    fr: 30,
    ip: 0,
    op: end,
    w: 360,
    h: 360,
    nm: `Atlas — ${mode}`,
    ddd: 0,
    assets: [],
    layers,
    markers: [{ tm: 0, cm: mode, dr: end }],
  };
  const json = JSON.stringify(data);
  writeFileSync(`public/animations/atlas/${mode}.json`, json);

}
