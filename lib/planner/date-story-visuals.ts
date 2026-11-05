type StoryVisual = { src: string; alt: string };

const artworkPath = "/illustrations/date-story/original-v1/";

const scenes = {
  coffee: { asset: "coffee", alt: "An illustration of a couple chatting over coffee" },
  dining: { asset: "dining", alt: "An illustration of a couple enjoying dinner together" },
  nightlife: { asset: "nightlife", alt: "An illustration of a couple talking on an evening terrace" },
  creative: { asset: "creative", alt: "An illustration of a couple discussing a painting in a gallery" },
  pottery: { asset: "pottery", alt: "An illustration of a couple working with clay together" },
  outdoors: { asset: "outdoors", alt: "An illustration of a couple enjoying a picnic in a leafy park" },
  cinema: { asset: "cinema", alt: "An illustration of a couple sharing a moment at the cinema" },
  music: { asset: "music", alt: "An illustration of a couple enjoying a live music performance" },
  games: { asset: "games", alt: "An illustration of a couple laughing over a board game" },
  active: { asset: "active", alt: "An illustration of a couple playing badminton outdoors" },
  together: { asset: "together", alt: "An illustration of a couple walking and chatting together" },
};

function sceneFor(category: string) {
  const value = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]/g, " ");
  if (/\b(?:cafes?|coffee|tea house|teahouse|bakery|dessert)\b/i.test(value)) return scenes.coffee;
  if (/\b(?:amusement|arcade|games?|bowling|theme park|escape room|karting)\b/i.test(value)) return scenes.games;
  if (/\bperforming arts\b/i.test(value)) return scenes.music;
  if (/\b(?:pottery|ceramics?)\b/i.test(value)) return scenes.pottery;
  if (/\b(?:art|arts|gallery|galleries|museum|cultur(?:e|al))\b/i.test(value)) return scenes.creative;
  if (/\b(?:cinema|movie|theater|theatre)\b/i.test(value)) return scenes.cinema;
  if (/\b(?:bar|lounge|nightclub|night club|rooftop|cocktail|wine)\b/i.test(value)) return scenes.nightlife;
  if (/\b(?:music|concert|karaoke|jazz|comedy|performing)\b/i.test(value)) return scenes.music;
  if (/\b(?:sports?|golf|fitness|gym|skating|trampoline|climbing|badminton|tennis|yoga|pilates)\b/i.test(value)) return scenes.active;
  if (/\b(?:parks?|garden|gardens|beach|nature|outdoors?|picnic|hiking|trail)\b/i.test(value)) return scenes.outdoors;
  if (/\b(?:restaurant|dining|food|bistro|grill|eatery)\b/i.test(value)) return scenes.dining;
  return scenes.together;
}

export function dateStoryVisuals(category = ""): readonly [StoryVisual, StoryVisual, StoryVisual] {
  const scene = sceneFor(category);
  return [
    { src: `${artworkPath}hello.webp`, alt: "An illustration of two people greeting each other with a smile" },
    { src: `${artworkPath}${scene.asset}.webp`, alt: scene.alt },
    { src: `${artworkPath}keepsake.webp`, alt: "An illustration of a couple looking at a photo they took together" },
  ];
}
