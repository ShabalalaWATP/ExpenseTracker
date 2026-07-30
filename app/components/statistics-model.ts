import type { Expense } from "./types";

export type RankedStat = {
  key: string;
  label: string;
  count: number;
  totalPence: number;
};

export type LocationStat = RankedStat & {
  countryCode: string;
  x?: number;
  y?: number;
};

export type StatisticsModel = {
  expenses: Expense[];
  totalPence: number;
  claimablePence: number;
  receiptCoverage: number;
  uniqueRestaurants: number;
  uniqueLocations: number;
  restaurants: RankedStat[];
  foodTypes: RankedStat[];
  mealTypes: RankedStat[];
  daily: Array<{ day: number; totalPence: number; count: number }>;
  locations: LocationStat[];
  countries: LocationStat[];
};

const COUNTRY_CENTRES: Record<string, [number, number]> = {
  AR: [32, 72], AU: [84, 78], AT: [53, 36], BE: [49, 34], BR: [34, 67],
  CA: [20, 24], CH: [51, 38], CL: [29, 76], CN: [76, 40], CZ: [54, 35],
  DE: [51, 34], DK: [51, 29], EG: [56, 51], ES: [47, 43], FI: [56, 24],
  FR: [48, 38], GB: [46, 32], GR: [55, 43], HR: [54, 40], HU: [56, 38],
  ID: [79, 66], IE: [44, 32], IN: [68, 53], IS: [40, 22], IT: [52, 42],
  JP: [88, 42], KE: [58, 63], KR: [84, 42], MA: [46, 49], MX: [20, 52],
  MY: [75, 62], NL: [50, 33], NO: [50, 24], NZ: [92, 84], PE: [27, 67],
  PH: [82, 59], PL: [55, 34], PT: [45, 43], RO: [58, 39], SE: [53, 25],
  SG: [77, 65], TH: [75, 57], TR: [59, 44], UA: [60, 34], US: [20, 40],
  VN: [78, 56], ZA: [55, 80],
};

function normalised(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

function rank(
  expenses: readonly Expense[],
  labelFor: (expense: Expense) => string,
): RankedStat[] {
  const groups = new Map<string, RankedStat>();
  expenses.forEach((expense) => {
    const label = labelFor(expense).trim() || "Not identified";
    const key = normalised(label);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalPence += expense.eligibleAmountPence;
    } else {
      groups.set(key, {
        key,
        label,
        count: 1,
        totalPence: expense.eligibleAmountPence,
      });
    }
  });
  return [...groups.values()].sort(
    (left, right) =>
      right.count - left.count ||
      right.totalPence - left.totalPence ||
      left.label.localeCompare(right.label, "en-GB"),
  );
}

function foodType(merchant: string): string {
  const value = normalised(merchant);
  const matches: Array<[RegExp, string]> = [
    [/(?:cafe|café|coffee|espresso|starbucks|costa|nero)/, "Café & coffee"],
    [/\b(pizza|pizzeria)\b/, "Pizza"],
    [/\b(burger|mcdonald|wendy|five guys|shake shack)\b/, "Burgers"],
    [/\b(sushi|ramen|japanese|izakaya)\b/, "Japanese"],
    [/\b(indian|curry|tandoori)\b/, "Indian"],
    [/\b(chinese|noodle|dim sum)\b/, "Chinese"],
    [/\b(bakery|boulangerie|pret|sandwich|subway)\b/, "Bakery & sandwiches"],
    [/\b(pub|bar|grill|steak)\b/, "Pub & grill"],
    [/\b(supermarket|tesco|sainsbury|waitrose|aldi|lidl|coop|co-op)\b/, "Groceries"],
  ];
  return matches.find(([pattern]) => pattern.test(value))?.[1] ?? "Other food";
}

function countryCode(expense: Expense): string {
  const original = expense.originalCountry?.toUpperCase();
  return original && original !== "UNKNOWN"
    ? original
    : expense.country.toUpperCase();
}

function locationRank(expenses: readonly Expense[]): LocationStat[] {
  const groups = new Map<string, LocationStat>();
  expenses.forEach((expense) => {
    const label = (
      expense.location ||
      expense.country ||
      "Not identified"
    ).trim();
    const code = countryCode(expense);
    const key = `${code}|${normalised(label)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalPence += expense.eligibleAmountPence;
      return;
    }
    const position = COUNTRY_CENTRES[code];
    groups.set(key, {
      key,
      label,
      count: 1,
      totalPence: expense.eligibleAmountPence,
      countryCode: code,
      x: position?.[0],
      y: position?.[1],
    });
  });
  return [...groups.values()].sort(
    (left, right) =>
      right.count - left.count ||
      right.totalPence - left.totalPence ||
      left.label.localeCompare(right.label, "en-GB"),
  );
}

function countryRank(expenses: readonly Expense[]): LocationStat[] {
  const groups = new Map<string, LocationStat>();
  expenses.forEach((expense) => {
    const code = countryCode(expense);
    const existing = groups.get(code);
    if (existing) {
      existing.count += 1;
      existing.totalPence += expense.eligibleAmountPence;
      return;
    }
    const position = COUNTRY_CENTRES[code];
    groups.set(code, {
      key: code,
      label: code,
      count: 1,
      totalPence: expense.eligibleAmountPence,
      countryCode: code,
      x: position?.[0],
      y: position?.[1],
    });
  });
  return [...groups.values()].sort(
    (left, right) =>
      right.count - left.count ||
      right.totalPence - left.totalPence ||
      left.label.localeCompare(right.label, "en-GB"),
  );
}

export function buildStatistics(
  expenses: readonly Expense[],
  claimPeriod: string,
): StatisticsModel {
  const periodExpenses = expenses.filter(
    (expense) =>
      !expense.deletedAt &&
      expense.date.startsWith(`${claimPeriod}-`),
  );
  const foodExpenses = periodExpenses.filter(
    (expense) => !expense.category || expense.category === "food",
  );
  const restaurants = rank(foodExpenses, (expense) => expense.merchant);
  const foodTypes = rank(foodExpenses, (expense) => foodType(expense.merchant));
  const mealTypes = rank(foodExpenses, (expense) => {
    const context = expense.mealContext || "Not identified";
    return context === "mixed"
      ? "Mixed meal"
      : context.charAt(0).toUpperCase() + context.slice(1);
  });
  const days = new Date(
    Number(claimPeriod.slice(0, 4)),
    Number(claimPeriod.slice(5, 7)),
    0,
  ).getDate();
  const daily = Array.from({ length: days }, (_, index) => {
    const dayExpenses = periodExpenses.filter(
      (expense) => Number(expense.date.slice(8, 10)) === index + 1,
    );
    return {
      day: index + 1,
      count: dayExpenses.length,
      totalPence: dayExpenses.reduce(
        (total, expense) => total + expense.eligibleAmountPence,
        0,
      ),
    };
  });
  const locations = locationRank(periodExpenses);
  const countries = countryRank(periodExpenses);
  const totalPence = periodExpenses.reduce(
    (total, expense) => total + expense.eligibleAmountPence,
    0,
  );
  const withReceipt = periodExpenses.filter(
    (expense) => expense.receiptStatus === "stored" || expense.receiptUrl,
  ).length;
  return {
    expenses: periodExpenses,
    totalPence,
    claimablePence: periodExpenses.reduce(
      (total, expense) => total + (expense.claimableAmountPence ?? 0),
      0,
    ),
    receiptCoverage: periodExpenses.length
      ? Math.round((withReceipt / periodExpenses.length) * 100)
      : 0,
    uniqueRestaurants: restaurants.length,
    uniqueLocations: locations.length,
    restaurants,
    foodTypes,
    mealTypes,
    daily,
    locations,
    countries,
  };
}
