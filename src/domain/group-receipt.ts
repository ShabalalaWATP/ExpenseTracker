export type GroupReceiptLine = {
  description: string;
  quantity: number | null;
  totalPence?: number | null;
  eligible?: boolean | null;
  alcoholSuspected?: boolean;
};

export type GroupReceiptAssessment = {
  likelyShared: boolean;
  estimatedPeople: number;
  reason: string | null;
  mainUnits: number;
  drinkUnits: number;
  foodUnits: number;
};

const IGNORE = /\b(?:discount|promo|voucher|subtotal|total|change|vat|tax|service|gratuity|tip|sauce|dip|ketchup|mayo|mayonnaise|relish|dressing|extra|add[ -]?on)\b/i;
const DRINK = /\b(?:drink|cola|coke|pepsi|lemonade|water|juice|coffee|tea|latte|cappuccino|espresso|americano|smoothie|shake|milkshake|soda|fanta|sprite)\b/i;
const SIDE = /\b(?:fries|chips|wedges|onion rings?|slaw|coleslaw|side|strips?|tenders?|nuggets?|wings?|bread|garlic bread|rice|salad|beans|corn)\b/i;
const MAIN = /\b(?:burger|cheeseburger|sandwich|wrap|pizza|steak|steakhouse|grill|curry|kebab|burrito|taco|pasta|noodles|ramen|fish|salmon|breakfast|brunch|meal|platter|fried chicken|roast|pie)\b/i;

function units(quantity: number | null): number {
  if (!quantity || !Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(20, Math.max(1, Math.round(quantity)));
}

function lineUnits(line: GroupReceiptLine): number {
  if (line.quantity && Number.isFinite(line.quantity)) return units(line.quantity);
  const printed = line.description.match(/^\s*(\d{1,2})\s*[x×]\s*/i)?.[1];
  return printed ? units(Number(printed)) : 1;
}

function kind(description: string): "ignore" | "drink" | "side" | "main" | "food" {
  if (IGNORE.test(description)) return "ignore";
  if (DRINK.test(description)) return "drink";
  if (SIDE.test(description)) return "side";
  if (MAIN.test(description)) return "main";
  return "food";
}

export function assessGroupReceipt(
  lines: readonly GroupReceiptLine[],
): GroupReceiptAssessment {
  let mainUnits = 0;
  let drinkUnits = 0;
  let sideUnits = 0;
  let foodUnits = 0;
  let largestQuantity = 0;

  for (const line of lines) {
    if (!line.description.trim() || line.alcoholSuspected) continue;
    const count = lineUnits(line);
    const category = kind(line.description);
    if (category === "ignore") continue;
    foodUnits += count;
    largestQuantity = Math.max(largestQuantity, count);
    if (category === "main") mainUnits += count;
    if (category === "drink") drinkUnits += count;
    if (category === "side") sideUnits += count;
  }

  const pairedMeals = mainUnits >= 2 && drinkUnits >= 2;
  const repeatedMeals = mainUnits >= 2 && sideUnits >= 2;
  const manyMains = mainUnits >= 3;
  const manyItems = foodUnits >= 9 && (mainUnits >= 2 || drinkUnits >= 2);
  const repeatedItem = largestQuantity >= 4 && foodUnits >= 6;
  const likelyShared =
    pairedMeals || repeatedMeals || manyMains || manyItems || repeatedItem;
  const estimatedPeople = likelyShared
    ? Math.max(2, Math.min(8, Math.max(mainUnits, drinkUnits, Math.ceil(foodUnits / 4))))
    : 1;
  const reason = pairedMeals
    ? "The receipt contains multiple mains and drinks."
    : repeatedMeals
      ? "The receipt contains repeated mains and sides."
      : manyMains
        ? "The receipt contains several main meals."
        : manyItems
          ? "The receipt contains enough food and drink for more than one person."
          : repeatedItem
            ? "The receipt contains several repeated items."
            : null;

  return {
    likelyShared,
    estimatedPeople,
    reason,
    mainUnits,
    drinkUnits,
    foodUnits,
  };
}

function fingerprint(lines: readonly GroupReceiptLine[]): string {
  const canonical = lines.map((line) => [
    line.description.trim().toLocaleLowerCase("en-GB"),
    lineUnits(line),
    line.totalPence ?? null,
  ]);
  let hash = 2166136261;
  for (const character of JSON.stringify(canonical)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export type StoredGroupReceiptReview = {
  status: "single" | "shared";
  fingerprint: string;
  selectedItems?: number[];
};

export function groupReceiptState(
  lines: readonly GroupReceiptLine[],
  stored: StoredGroupReceiptReview | null,
) {
  const assessment = assessGroupReceipt(lines);
  const currentFingerprint = fingerprint(lines);
  const reviewed =
    Boolean(stored) && stored?.fingerprint === currentFingerprint;
  return {
    ...assessment,
    fingerprint: currentFingerprint,
    reviewed,
    decision: reviewed ? stored!.status : null,
    selectedItems: reviewed && stored?.selectedItems ? stored.selectedItems : [],
    pending: assessment.likelyShared && !reviewed,
  };
}
