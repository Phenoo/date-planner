import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dateStoryVisuals } from "../lib/planner/date-story-visuals";

test("story imagery follows the chosen venue category, including catalog categories", () => {
  const categories = [
    ["Café", "relaxed"], ["coffee_shop", "relaxed"],
    ["Italian restaurant", "food-and-dining"], ["Food & dining", "food-and-dining"],
    ["Cocktail bar", "luxurious"], ["Sports bar", "luxurious"],
    ["Art & culture", "unexpected"], ["Pottery studio", "creative"],
    ["Botanical garden", "outdoors"], ["Nature & outdoors", "outdoors"],
    ["Movie theater", "entertainment"], ["Cinema", "entertainment"],
    ["Live music venue", "unexpected"], ["Performing arts theater", "unexpected"],
    ["Bowling alley", "playful"], ["Amusement park", "playful"], ["Fun & games", "playful"],
    ["Tennis court", "active"], ["Yoga studio", "active"],
  ];
  for (const [category, illustration] of categories) {
    assert.equal(dateStoryVisuals(category)[1].src, `/illustrations/vibes/editorial-v2/${illustration}.webp`, category);
  }
  assert.equal(dateStoryVisuals("Barbecue restaurant")[1].src, "/illustrations/vibes/editorial-v2/food-and-dining.webp");
  assert.equal(dateStoryVisuals("Art gallery")[0].src, "/images/gallery.png");
  assert.equal(dateStoryVisuals("Pottery studio")[0].src, "/images/pottery.jpg");
  assert.equal(dateStoryVisuals("Live music venue")[0].src, "/images/rooftop.jpg");
});

test("unknown or unavailable venue categories retain generic date inspiration", () => {
  for (const category of [undefined, "", "Place to explore", "Unique experiences", "Unknown venue"]) {
    const visuals = dateStoryVisuals(category);
    assert.equal(visuals[0].src, "/images/together.jpg");
    assert.equal(visuals[1].src, "/illustrations/vibes/editorial-v2/unexpected.webp");
  }
});

test("every story visual is a local available asset with descriptive alternative text", () => {
  for (const category of ["Cafe", "Restaurant", "Bar", "Museum", "Pottery", "Park", "Cinema", "Concert", "Arcade", "Golf", "Place to explore"]) {
    const visuals = dateStoryVisuals(category);
    assert.equal(visuals.length, 3);
    assert.equal(new Set(visuals.map(visual => visual.src)).size, 3);
    assert.ok(visuals.some(visual => visual.illustration));
    assert.ok(visuals.some(visual => !visual.illustration));
    for (const visual of visuals) {
      assert.ok(existsSync(join(process.cwd(), "public", visual.src)), `${category}: ${visual.src}`);
      assert.ok(visual.alt.length > 10);
      assert.ok(visual.illustration || visual.alt.startsWith("Date inspiration:"));
    }
  }
});
