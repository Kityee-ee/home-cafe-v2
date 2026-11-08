// The whole menu. The guest page, the host page and the API all read this file,
// so a drink only has to be added or renamed here.

// `temps` lists how a drink can be served; the first one is the default.
export const DRINKS = {
  latte: { name: "Latte", temps: ["iced", "hot"] },
  "matcha-latte": { name: "Matcha Latte", temps: ["iced"] },
  "mont-blanc": { name: "Mont Blanc", temps: ["iced"] },
  "orange-americano": { name: "Orange Americano", temps: ["iced"] },
  americano: { name: "Americano", temps: ["hot", "iced"] },
  mocha: { name: "Mocha", temps: ["hot", "iced"] },
};

// The video cards on the front page. All of them are served iced.
export const POPULAR = [
  { id: "latte", temp: "iced", desc: "Espresso and milk over ice", media: "latte" },
  { id: "matcha-latte", temp: "iced", desc: "Matcha and milk over ice", media: "matcha" },
  { id: "mont-blanc", temp: "iced", desc: "Iced black coffee under a cream cap", media: "montblanc" },
  { id: "orange-americano", temp: "iced", desc: "Orange juice and tonic water over ice", media: "orange_americano" },
];

// "More options": the everyday coffees, hot or iced.
export const BASICS = [
  { id: "latte", desc: "Espresso and milk" },
  { id: "americano", desc: "Espresso and water" },
  { id: "mocha", desc: "Espresso, chocolate and milk" },
];

// No limit on what a guest orders; this only stops a typo like 200 lattes.
export const MAX_PER_DRINK = 20;

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// "Iced Latte" for drinks that come both ways, just "Mont Blanc" for those that don't.
export function drinkLabel({ id, temp }) {
  const drink = DRINKS[id];
  return drink.temps.length > 1 ? `${cap(temp)} ${drink.name}` : drink.name;
}

export function countDrinks(items) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}
