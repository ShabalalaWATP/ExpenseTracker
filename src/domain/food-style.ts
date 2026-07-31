export const FOOD_STYLE_TAGS = [
  "fried_chicken",
  "burgers",
  "pizza",
  "sandwiches_wraps",
  "bakery",
  "coffee_hot_drinks",
  "cold_drinks",
  "breakfast",
  "japanese",
  "indian",
  "chinese_noodles",
  "mexican",
  "italian",
  "mediterranean",
  "fresh_healthy",
  "desserts_snacks",
  "groceries",
  "pub_food",
  "seafood",
  "steak_grill",
  "other_food",
] as const;

export type FoodStyleTag = (typeof FOOD_STYLE_TAGS)[number];

export const FOOD_STYLE_LABELS: Record<FoodStyleTag, string> = {
  fried_chicken: "Fried chicken",
  burgers: "Burgers",
  pizza: "Pizza",
  sandwiches_wraps: "Sandwiches & wraps",
  bakery: "Bakery",
  coffee_hot_drinks: "Coffee & hot drinks",
  cold_drinks: "Cold drinks",
  breakfast: "Breakfast food",
  japanese: "Japanese",
  indian: "Indian",
  chinese_noodles: "Chinese & noodles",
  mexican: "Mexican",
  italian: "Italian & pasta",
  mediterranean: "Mediterranean & Middle Eastern",
  fresh_healthy: "Fresh & plant-based",
  desserts_snacks: "Desserts & snacks",
  groceries: "Groceries",
  pub_food: "Pub food",
  seafood: "Seafood",
  steak_grill: "Steak & grills",
  other_food: "Other food",
};

export function isFoodStyleTag(value: unknown): value is FoodStyleTag {
  return typeof value === "string" &&
    (FOOD_STYLE_TAGS as readonly string[]).includes(value);
}

export function normaliseFoodStyleTags(value: unknown): FoodStyleTag[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isFoodStyleTag))].slice(0, 3);
}

const FOOD_STYLE_PATTERNS: ReadonlyArray<
  readonly [RegExp, Exclude<FoodStyleTag, "other_food">]
> = [
  [
    /\b(butchies|fried chicken|chicken shop|chicken tender|chicken burger|chicken wing|hot wing|kfc|popeyes|wingstop|slim chickens|chicken cottage)\b/,
    "fried_chicken",
  ],
  [
    /\b(burger|cheeseburger|hamburger|mcdonalds?|five guys|shake shack|burger king)\b/,
    "burgers",
  ],
  [/\b(pizza|pizzeria|dominos?|pizza hut|papa johns?)\b/, "pizza"],
  [/\b(sandwich|wrap|bagel|panini|sub|toastie)\b/, "sandwiches_wraps"],
  [
    /\b(croissant|pastry|bakery|boulangerie|patisserie|muffin|bread|pretzel)\b/,
    "bakery",
  ],
  [
    /\b(cafe|coffee|espresso|latte|cappuccino|americano|flat white|hot chocolate|tea|starbucks|costa|caffe nero)\b/,
    "coffee_hot_drinks",
  ],
  [
    /\b(juice|smoothie|cola|lemonade|water|soft drink|milkshake)\b/,
    "cold_drinks",
  ],
  [
    /\b(breakfast|brunch|porridge|granola|pancake|waffle|eggs benedict|full english)\b/,
    "breakfast",
  ],
  [
    /\b(sushi|ramen|japanese|izakaya|teriyaki|yakitori|katsu|udon|soba)\b/,
    "japanese",
  ],
  [/\b(indian|curry|tandoori|masala|biryani|naan|dosa)\b/, "indian"],
  [
    /\b(chinese|noodle|dim sum|wonton|chow mein|bao|dumpling|szechuan|sichuan)\b/,
    "chinese_noodles",
  ],
  [/\b(mexican|taco|burrito|quesadilla|nachos|taqueria)\b/, "mexican"],
  [
    /\b(italian|pasta|spaghetti|lasagne|lasagna|risotto|trattoria)\b/,
    "italian",
  ],
  [
    /\b(mediterranean|middle eastern|lebanese|greek|turkish|falafel|hummus|shawarma|kebab)\b/,
    "mediterranean",
  ],
  [
    /\b(salad|fruit|vegetable|vegan|vegetarian|poke bowl|acai)\b/,
    "fresh_healthy",
  ],
  [
    /\b(cake|dessert|cookie|biscuit|chocolate|ice cream|gelato|doughnut|donut|snack|crisps)\b/,
    "desserts_snacks",
  ],
  [
    /\b(supermarket|tesco|sainsburys?|waitrose|aldi|lidl|grocery|groceries|marks and spencer|m&s food)\b/,
    "groceries",
  ],
  [
    /\b(pub|gastropub|wetherspoons?|inn|public house|fish and chips|pie and mash)\b/,
    "pub_food",
  ],
  [
    /\b(seafood|fishmonger|oyster|lobster|prawn|shrimp|mussels|crab)\b/,
    "seafood",
  ],
  [
    /\b(steak|steakhouse|chophouse|grill(?:ed)?|ribeye|sirloin|t[- ]?bone|rump steak|fillet steak|beef fillet)\b/,
    "steak_grill",
  ],
];

export function inferFoodStyleTags(text: string): FoodStyleTag[] {
  const normalised = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-GB");
  return FOOD_STYLE_PATTERNS
    .filter(([pattern]) => pattern.test(normalised))
    .map(([, tag]) => tag)
    .slice(0, 3);
}
