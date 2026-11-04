import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { heartAtlasAsset, humanAtlasAsset, plannerAnimations, type CompanionTheme } from "../lib/animations/registry";
import { plannerQuestions } from "../lib/planner/questions";

const keyframe = z.object({ t: z.number(), s: z.array(z.number()) });
const property = z.discriminatedUnion("a", [
  z.object({ a: z.literal(0), k: z.union([z.number(), z.array(z.number())]) }),
  z.object({ a: z.literal(1), k: z.array(keyframe).min(2) }),
]);
const animationSchema = z.object({
  fr: z.number().positive(), ip: z.number(), op: z.number(), assets: z.array(z.unknown()),
  layers: z.array(z.object({
    ind: z.number(), parent: z.number().optional(), nm: z.string(), ip: z.number(), op: z.number(),
    ks: z.object({ p: property, r: property, s: property, o: property }),
  })),
});

test("the live companion uses the original heart assets, including its loading loop", () => {
  const otherPoses = ["walking", "idle", "success", "swap", "lock"] as const;
  for (const pose of [...Object.values(plannerAnimations), ...otherPoses]) for (const lively of [false, true]) {
    const asset = heartAtlasAsset(pose, lively);
    assert.doesNotMatch(asset.src, /\/human\//);
    assert.equal(readFileSync(join(process.cwd(), "public", asset.src)).subarray(0, 2).toString(), "PK");
    assert.match(readFileSync(join(process.cwd(), "public", asset.fallback), "utf8"), /<svg[^>]+viewBox=/);
    const data = animationSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "public", asset.src.replace(/\.lottie$/, ".json")), "utf8")));
    assert.ok(data.layers.some(({ nm }) => nm === "Atlas location-pin silhouette"));
  }
});

test("every planner step has a lively animation, packaged player asset and reduced-motion fallback", () => {
  const states = [...plannerQuestions.map(({ id }) => ({ id, pose: plannerAnimations[id] })), { id: "generation", pose: "concierge" as const }];
  for (const theme of ["white", "red", "dark"] satisfies CompanionTheme[]) for (const { id, pose } of states) {
    assert.ok(pose, `No pose for ${id}`);
    const asset = humanAtlasAsset(pose, theme);
    assert.ok(asset, `No lively animation for ${id}`);
    const archive = readFileSync(join(process.cwd(), "public", asset.src));
    assert.equal(archive.subarray(0, 2).toString(), "PK");
    assert.ok(archive.includes(Buffer.from("animations/animation.json")));
    assert.match(readFileSync(join(process.cwd(), "public", asset.fallback), "utf8"), /<svg[^>]+viewBox=/);
  }
});

test("lively loops have valid layer parents, bounded keyframes and matching visible endpoints", () => {
  const sources = new Set((["white", "red", "dark"] satisfies CompanionTheme[]).flatMap((theme) => Object.values(plannerAnimations).map((pose) => humanAtlasAsset(pose, theme).src.replace(/\.lottie$/, ".json"))));
  for (const source of sources) {
    const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "public", source), "utf8"));
    const animation = animationSchema.parse(raw);
    assert.ok(animation.op > animation.ip);
    assert.ok((animation.op - animation.ip) / animation.fr >= 3);
    assert.equal(animation.assets.length, 0, "Planner loops must remain self-contained vector artwork");
    for (const part of ["Human face", "Shirt", "Left trouser leg", "Right trouser leg", "Little sneaker", "Open human hand"]) assert.ok(animation.layers.some(({ nm }) => nm === part), `Missing ${part}`);
    const ids = new Set(animation.layers.map((layer) => layer.ind));
    assert.equal(ids.size, animation.layers.length, `Duplicate layer IDs in ${source}`);
    for (const layer of animation.layers) {
      if (layer.parent !== undefined) assert.ok(ids.has(layer.parent), `Missing parent in ${layer.nm}`);
      assert.equal(layer.op, animation.op, `${layer.nm} ends before the loop`);
      const opacity = layer.ks.o;
      const hiddenAtSeam = opacity.a === 1 && opacity.k[0].s[0] === 0 && opacity.k.at(-1)?.s[0] === 0;
      for (const [name, track] of Object.entries(layer.ks)) {
        if (track.a !== 1) continue;
        for (let index = 0; index < track.k.length; index++) {
          assert.ok(track.k[index].t >= animation.ip && track.k[index].t <= animation.op);
          if (index > 0) assert.ok(track.k[index].t > track.k[index - 1].t);
        }
        if (hiddenAtSeam) continue;
        const first = track.k[0].s;
        const lastFrame = track.k.at(-1);
        assert.ok(lastFrame);
        const last = lastFrame.s;
        assert.equal(first.length, last.length);
        first.forEach((value, index) => {
          const delta = Math.abs(value - last[index]);
          assert.ok(name === "r" ? delta % 360 < .0001 : delta < .0001, `${source}: ${layer.nm}.${name} jumps at the seam`);
        });
      }
    }
  }
});
test("the companion has distinct theme artwork rather than a color filter", () => {
  const sources = (["white", "red", "dark"] satisfies CompanionTheme[]).map((theme) => readFileSync(join(process.cwd(), "public", humanAtlasAsset("discover", theme).src.replace(/\.lottie$/, ".json")), "utf8"));
  assert.equal(new Set(sources).size, 3);
});

test("Oge's walking cycle has alternating leg and arm motion with a seamless static fallback", () => {
  for (const theme of ["white", "red", "dark"] satisfies CompanionTheme[]) {
    const asset = humanAtlasAsset("walking", theme);
    const data = animationSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "public", asset.src.replace(/\.lottie$/, ".json")), "utf8")));
    const legs = data.layers.filter(({ nm }) => nm.endsWith("leg joint"));
    assert.equal(legs.length, 2);
    for (const leg of legs) {
      assert.equal(leg.ks.r.a, 1);
      if (leg.ks.r.a === 1) {
        assert.ok(Math.abs(leg.ks.r.k[0].s[0] - leg.ks.r.k[1].s[0]) >= 40);
        assert.deepEqual(leg.ks.r.k[0].s, leg.ks.r.k.at(-1)?.s);
      }
    }
    const arms = data.layers.filter(({ nm }) => nm.endsWith("shoulder joint"));
    assert.equal(arms.length, 2);
    for (const arm of arms) if (arm.ks.r.a === 1) assert.ok(Math.abs(arm.ks.r.k[0].s[0] - arm.ks.r.k[1].s[0]) >= 40);
    assert.equal(readFileSync(join(process.cwd(), "public", asset.src)).subarray(0, 2).toString(), "PK");
    assert.match(readFileSync(join(process.cwd(), "public", asset.fallback), "utf8"), /viewBox="0 0 360 360"/);
  }
});
