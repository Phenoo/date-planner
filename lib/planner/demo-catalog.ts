import type { Experience } from "./schema";

export const areaCenters: Record<string, { lat: number; lng: number }> = {
  Lekki: { lat: 6.4433, lng: 3.4748 },
  "Victoria Island": { lat: 6.4281, lng: 3.4219 },
  Ikoyi: { lat: 6.4549, lng: 3.4351 },
  Ikeja: { lat: 6.6018, lng: 3.3515 },
};
// Fictional development fixtures. No record represents a verified business.
const fixtures: {
  id: string;
  name: string;
  venue: string;
  category: Experience["category"];
  price: number;
  duration: number;
  vibes: string[];
  tags: string[];
  image: string;
  area?: string;
  indoor?: boolean;
  quiet?: boolean;
  open?: number;
  close?: number;
  days?: number[];
  dietary?: string[];
  accessible?: boolean;
  description: string;
}[] = [
  {
    id: "demo-clay",
    name: "A little clay, a little connection",
    venue: "Clay & Company · Demo studio",
    category: "Art & culture",
    price: 8500,
    duration: 90,
    vibes: ["Creative", "Romantic", "Relaxed"],
    tags: ["art", "pottery", "quiet", "hands-on"],
    image: "/images/pottery.jpg",
    description:
      "Slow down together over a guided pottery session. Make something imperfect, personal, and entirely your own.",
  },
  {
    id: "demo-paint",
    name: "Paint your kind of afternoon",
    venue: "The Colour Room · Demo studio",
    category: "Art & culture",
    price: 6500,
    duration: 75,
    vibes: ["Creative", "Playful", "Romantic"],
    tags: ["art", "painting", "creative"],
    image: "/images/gallery.png",
    description:
      "Two canvases, a collection of colours, and space to create. An easygoing painting session for every level.",
  },
  {
    id: "demo-gallery",
    name: "Art, stories & a slower pace",
    venue: "Atelier Eight · Demo gallery",
    category: "Art & culture",
    price: 2000,
    duration: 60,
    vibes: ["Creative", "Relaxed", "Romantic"],
    tags: ["art", "gallery", "quiet", "culture"],
    image: "/images/gallery.png",
    close: 1080,
    description:
      "Wander through a small contemporary art collection and discover the pieces you each gravitate toward.",
  },
  {
    id: "demo-garden-table",
    name: "Dinner, with room to linger",
    venue: "The Garden Table · Demo restaurant",
    category: "Food & dining",
    price: 10000,
    duration: 90,
    vibes: ["Romantic", "Food & dining", "Relaxed"],
    tags: ["meal", "food", "restaurant", "quiet", "garden"],
    dietary: ["vegetarian", "halal"],
    image: "/images/restaurant.jpg",
    description:
      "A leafy, conversation-friendly setting for an unhurried meal. This sample menu budget includes food and a soft drink.",
  },
  {
    id: "demo-bistro",
    name: "A table just for two",
    venue: "Sunday Bistro · Demo restaurant",
    category: "Food & dining",
    price: 7500,
    duration: 75,
    vibes: ["Food & dining", "Relaxed", "Romantic"],
    tags: ["meal", "food", "restaurant", "quiet"],
    dietary: ["vegetarian", "vegan", "gluten-free"],
    image: "/images/cafe.jpg",
    description:
      "Comforting plates and a cosy corner. A relaxed dinner designed around good food and better conversation.",
  },
  {
    id: "demo-tasting",
    name: "A taste of something new",
    venue: "The Tasting House · Demo kitchen",
    category: "Food & dining",
    price: 18000,
    duration: 105,
    vibes: ["Luxurious", "Food & dining", "Unexpected", "Romantic"],
    tags: ["meal", "food", "restaurant", "tasting", "quiet"],
    image: "/images/restaurant.jpg",
    open: 960,
    description:
      "Make dinner an experience with a sample three-course tasting menu in an intimate dining room.",
  },
  {
    id: "demo-picnic",
    name: "An afternoon with no agenda",
    venue: "Palm Grove · Demo picnic garden",
    category: "Nature & outdoors",
    price: 5000,
    duration: 75,
    vibes: ["Outdoors", "Relaxed", "Romantic"],
    tags: ["picnic", "nature", "quiet", "food", "meal"],
    indoor: false,
    dietary: ["vegetarian", "vegan", "halal"],
    image: "/images/picnic.png",
    close: 1140,
    description:
      "A shaded spot, a sample picnic basket, and time for each other. Bring a blanket and leave the rush behind.",
  },
  {
    id: "demo-walk",
    name: "The scenic route, together",
    venue: "The Green Walk · Demo garden",
    category: "Nature & outdoors",
    price: 1500,
    duration: 45,
    vibes: ["Outdoors", "Relaxed", "Active"],
    tags: ["nature", "walk", "quiet"],
    indoor: false,
    image: "/images/picnic.png",
    close: 1110,
    description:
      "An easy stroll along a shaded garden trail. A gentle way to begin the day or reconnect after a busy week.",
  },
  {
    id: "demo-games",
    name: "A little friendly competition",
    venue: "Playhouse · Demo games lounge",
    category: "Fun & games",
    price: 5000,
    duration: 60,
    vibes: ["Playful", "Entertainment", "Unexpected"],
    tags: ["games", "arcade", "fun"],
    quiet: false,
    image: "/images/games.jpg",
    description:
      "Pick a board game, challenge each other, and see who gets competitive first. A low-pressure icebreaker.",
  },
  {
    id: "demo-cooking",
    name: "The recipe for a good date",
    venue: "Two Aprons · Demo cooking studio",
    category: "Unique experiences",
    price: 12000,
    duration: 105,
    vibes: ["Creative", "Food & dining", "Unexpected", "Adventurous"],
    tags: ["meal", "food", "cooking", "art", "hands-on"],
    dietary: ["vegetarian", "halal"],
    image: "/images/cafe.jpg",
    description:
      "Learn a new recipe side by side, then sit down to the meal you made together. Sample ingredients are included.",
  },
  {
    id: "demo-coffee",
    name: "Coffee & a conversation",
    venue: "Little Chapter · Demo book café",
    category: "Food & dining",
    price: 3000,
    duration: 45,
    vibes: ["Relaxed", "Creative", "Romantic"],
    tags: ["coffee", "books", "quiet", "food"],
    dietary: ["vegetarian", "vegan", "halal", "gluten-free"],
    image: "/images/cafe.jpg",
    description:
      "A book-lined corner, two warm drinks, and something sweet. A simple moment that leaves room for connection.",
  },
  {
    id: "demo-rooftop",
    name: "Meet me above the city",
    venue: "Golden Hour · Demo rooftop",
    category: "Unique experiences",
    price: 14000,
    duration: 75,
    vibes: ["Romantic", "Luxurious", "Unexpected"],
    tags: ["rooftop", "views", "quiet"],
    indoor: false,
    image: "/images/terrace.png",
    open: 960,
    description:
      "Watch the sky change colour over a sample rooftop drinks experience. An atmospheric finish to your date.",
  },
  {
    id: "demo-vi-gallery",
    name: "A new perspective on the city",
    venue: "Frame House · Demo gallery",
    category: "Art & culture",
    price: 3500,
    duration: 60,
    vibes: ["Creative", "Relaxed"],
    tags: ["art", "gallery", "quiet"],
    area: "Victoria Island",
    image: "/images/gallery.png",
    close: 1080,
    description:
      "Explore a small photography exhibition and trade stories inspired by the images you discover.",
  },
  {
    id: "demo-vi-dinner",
    name: "An evening worth dressing up for",
    venue: "Amber Room · Demo restaurant",
    category: "Food & dining",
    price: 13000,
    duration: 90,
    vibes: ["Romantic", "Luxurious", "Food & dining"],
    tags: ["meal", "food", "restaurant", "quiet"],
    area: "Victoria Island",
    dietary: ["vegetarian"],
    image: "/images/restaurant.jpg",
    description:
      "Warm lighting, a thoughtfully paced sample dinner, and an evening that feels like an occasion.",
  },
  {
    id: "demo-ikoyi",
    name: "A quiet escape for two",
    venue: "The Reading Garden · Demo café",
    category: "Food & dining",
    price: 6000,
    duration: 75,
    vibes: ["Relaxed", "Creative", "Romantic"],
    tags: ["meal", "food", "books", "quiet", "garden"],
    area: "Ikoyi",
    dietary: ["vegetarian", "vegan"],
    image: "/images/cafe.jpg",
    description:
      "Share a light meal and a favourite story in this sample garden café experience.",
  },
  {
    id: "demo-ikeja",
    name: "Make a little music together",
    venue: "Rhythm Corner · Demo studio",
    category: "Unique experiences",
    price: 6500,
    duration: 75,
    vibes: ["Playful", "Creative", "Entertainment"],
    tags: ["music", "creative", "fun"],
    area: "Ikeja",
    quiet: false,
    image: "/images/games.jpg",
    description:
      "A playful introductory percussion session. Try a new rhythm and make a shared memory.",
  },
];
export const demoCatalog: Experience[] = fixtures.map((item, index) => {
  const area = item.area ?? "Lekki";
  const center = areaCenters[area];
  return {
    ...item,
    country: "Nigeria",
    currency: "NGN",
    city: "Lagos",
    area,
    lat: center.lat + (index % 3) * 0.003,
    lng: center.lng + (index % 4) * 0.002,
    priceType: "per-person",
    indoor: item.indoor ?? true,
    quiet: item.quiet ?? true,
    accessible: item.accessible ?? true,
    dietary: item.dietary ?? [],
    publicVenue: true,
    maxGuests: 8,
    occasions: item.vibes.includes("Romantic")
      ? [
          "Romantic date",
          "Anniversary",
          "Birthday",
          "First date",
          "Surprise date",
        ]
      : ["Casual date", "First date", "Just because", "Adventure together"],
    hours: (item.days ?? [0, 1, 2, 3, 4, 5, 6]).map((day) => ({
      day,
      open: item.open ?? 540,
      close: item.close ?? 1320,
    })),
    active: true,
    approved: true,
    demo: true,
    verifiedAt: null,
    bookingUrl: null,
    sourceUrl: null,
    reservation: "Demonstration only. This experience cannot be booked.",
    quality: 0.65,
  };
});
