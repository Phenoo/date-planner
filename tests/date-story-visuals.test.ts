import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dateStoryVisuals } from "../lib/planner/date-story-visuals";

test("story imagery follows the chosen venue category, including catalog categories", () => {
  const categories = [
    ["Café", "coffee"], ["coffee_shop", "coffee"],
    ["Italian restaurant", "dining"], ["Food & dining", "dining"],
    ["Cocktail bar", "nightlife"], ["Sports bar", "nightlife"],
    ["Art & culture", "creative"], ["Pottery studio", "pottery"],
    ["Botanical garden", "outdoors"], ["Nature & outdoors", "outdoors"],
    ["Movie theater", "cinema"], ["Cinema", "cinema"],
    ["Live music venue", "music"], ["Performing arts theater", "music"],
    ["Bowling alley", "games"], ["Amusement park", "games"], ["Fun & games", "games"],
    ["Tennis court", "active"], ["Yoga studio", "active"],
  ];
  for (const [category, illustration] of categories) {
    assert.equal(dateStoryVisuals(category)[1].src, `/illustrations/date-story/original-v1/${illustration}.webp`, category);
  }
  assert.equal(dateStoryVisuals("Barbecue restaurant")[1].src, "/illustrations/date-story/original-v1/dining.webp");
  assert.notEqual(dateStoryVisuals("Art gallery")[1].src, dateStoryVisuals("Pottery studio")[1].src);
});

test("unknown or unavailable venue categories retain generic date inspiration", () => {
  for (const category of [undefined, "", "Place to explore", "Unique experiences", "Unknown venue"]) {
    const visuals = dateStoryVisuals(category);
    assert.equal(visuals[1].src, "/illustrations/date-story/original-v1/together.webp");
  }
});

test("every story visual uses new original artwork, with no repeated image within a story", () => {
  const assets = new Set<string>();
  for (const category of ["Cafe", "Restaurant", "Bar", "Museum", "Pottery", "Park", "Cinema", "Concert", "Arcade", "Golf", "Place to explore"]) {
    const visuals = dateStoryVisuals(category);
    assert.equal(visuals.length, 3);
    assert.equal(new Set(visuals.map(visual => visual.src)).size, 3);
    for (const visual of visuals) {
      assert.ok(visual.src.startsWith("/illustrations/date-story/original-v1/"));
      assert.ok(existsSync(join(process.cwd(), "public", visual.src)), `${category}: ${visual.src}`);
      assert.ok(visual.alt.length > 10);
      assets.add(visual.src);
    }
  }
  assert.equal(assets.size, 13);
});
