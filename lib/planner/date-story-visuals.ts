type StoryVisual = { src: string; alt: string; illustration?: boolean };

const scenes = {
  coffee: { photo: "cafe.jpg", illustration: "relaxed", scene: "A welcoming café", moment: "An illustrated couple chatting over coffee" },
  dining: { photo: "restaurant.jpg", illustration: "food-and-dining", scene: "A warm restaurant setting", moment: "An illustrated couple sharing a meal" },
  nightlife: { photo: "terrace.png", illustration: "luxurious", scene: "A table for two at sunset", moment: "An illustrated couple getting ready for an evening out" },
  creative: { photo: "gallery.png", illustration: "creative", scene: "A couple exploring an art gallery", moment: "An illustrated couple making pottery together" },
  outdoors: { photo: "picnic.png", illustration: "outdoors", scene: "A picnic set beneath leafy trees", moment: "An illustrated couple relaxing outdoors" },
  cinema: { photo: "rooftop.jpg", illustration: "entertainment", scene: "A colourful city after dark", moment: "An illustrated couple sharing a laugh at the cinema" },
  music: { photo: "rooftop.jpg", illustration: "unexpected", scene: "A colourful city after dark", moment: "An illustrated couple finding their next little adventure" },
  games: { photo: "games.jpg", illustration: "playful", scene: "A colourful arcade", moment: "An illustrated couple enjoying a board game" },
  active: { photo: "together.jpg", illustration: "active", scene: "Two hands making a heart in the sunlight", moment: "An illustrated couple taking a break from badminton" },
  together: { photo: "together.jpg", illustration: "unexpected", scene: "Two hands making a heart in the sunlight", moment: "An illustrated couple finding their next little adventure" },
};

function sceneFor(category: string) {
  const value = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]/g, " ");
  if (/\b(?:cafes?|coffee|tea house|teahouse|bakery|dessert)\b/i.test(value)) return scenes.coffee;
  if (/\b(?:amusement|arcade|games?|bowling|theme park|escape room|karting)\b/i.test(value)) return scenes.games;
  if (/\b(?:art|arts|gallery|galleries|museum|pottery|ceramics?|studio|cultur(?:e|al))\b/i.test(value)) return scenes.creative;
  if (/\b(?:cinema|movie|theater|theatre)\b/i.test(value)) return scenes.cinema;
  if (/\b(?:bar|lounge|nightclub|night club|rooftop|cocktail|wine)\b/i.test(value)) return scenes.nightlife;
  if (/\b(?:music|concert|karaoke|jazz|comedy|performing)\b/i.test(value)) return scenes.music;
  if (/\b(?:sports?|golf|fitness|gym|skating|trampoline|climbing|badminton|tennis)\b/i.test(value)) return scenes.active;
  if (/\b(?:parks?|garden|gardens|beach|nature|outdoors?|picnic|hiking|trail)\b/i.test(value)) return scenes.outdoors;
  if (/\b(?:restaurant|dining|food|bistro|grill|eatery)\b/i.test(value)) return scenes.dining;
  return scenes.together;
}

export function dateStoryVisuals(category = ""): readonly [StoryVisual, StoryVisual, StoryVisual] {
  const scene = sceneFor(category);
  return [
    { src: `/images/${scene.photo}`, alt: `Date inspiration: ${scene.scene.toLowerCase()}` },
    { src: `/illustrations/vibes/editorial-v2/${scene.illustration}.webp`, alt: scene.moment, illustration: true },
    scene.photo === "together.jpg"
      ? { src: "/illustrations/vibes/editorial-v2/romantic.webp", alt: "An illustrated couple sharing an umbrella", illustration: true }
      : { src: "/images/together.jpg", alt: "Date inspiration: a heart made with two hands in the sunlight" },
  ];
}
