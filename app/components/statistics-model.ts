import type { Expense } from "./types";

export type StatisticsFilters = {
  tripId?: string;
  mealContext?: string;
  country?: string;
};

export type RankedStat = {
  key: string;
  label: string;
  count: number;
  totalPence: number;
  expenseIds: string[];
};

export type MapPoint = RankedStat & {
  latitude: number;
  longitude: number;
  precision: "venue" | "address" | "city" | "country";
};

export type DailyStat = {
  date: string;
  day: number;
  totalPence: number;
  foodPence: number;
  claimablePence: number;
  count: number;
  expenseIds: string[];
};

export type StatisticsModel = {
  expenses: Expense[];
  totalPence: number;
  claimablePence: number;
  previousTotalPence: number;
  changePercent: number | null;
  averageActiveDayPence: number;
  medianReceiptPence: number;
  receiptCoverage: number;
  uniqueRestaurants: number;
  uniqueLocations: number;
  restaurants: RankedStat[];
  foodTypes: RankedStat[];
  mealTypes: RankedStat[];
  currencies: RankedStat[];
  daily: DailyStat[];
  locations: RankedStat[];
  mapPoints: MapPoint[];
  preciseLocationCount: number;
  countryOptions: string[];
};

const COUNTRY_CENTRES: Record<string, [number, number]> = {
  AR: [-64, -34], AU: [134, -25], AT: [14, 47.5], BE: [4.7, 50.8],
  BR: [-52, -10], CA: [-106, 56], CH: [8.2, 46.8], CL: [-71, -33],
  CN: [104, 35], CZ: [15.5, 49.8], DE: [10.5, 51], DK: [9.5, 56],
  EG: [30, 27], ES: [-3.5, 40], FI: [26, 64], FR: [2.2, 46.2],
  GB: [-2.5, 54.2], GR: [22, 39], HR: [16.5, 45.2], HU: [19.5, 47],
  ID: [118, -2], IE: [-8, 53], IN: [79, 22], IS: [-19, 65],
  IT: [12.5, 42.8], JP: [138, 36], KE: [37.9, 0.2], KR: [128, 36],
  MA: [-7, 31.8], MX: [-102, 23], MY: [102, 4], NL: [5.5, 52.2],
  NO: [8, 61], NZ: [174, -41], PE: [-76, -10], PH: [122, 12],
  PL: [19, 52], PT: [-8, 39.5], RO: [25, 46], SE: [15, 62],
  SG: [103.82, 1.35], TH: [101, 15], TR: [35, 39], UA: [31, 49],
  US: [-98, 39], VN: [108, 16], ZA: [24, -29],
};

const CITY_CENTRES: Record<string, [number, number]> = {
  london: [-0.1276, 51.5072], portsmouth: [-1.0872, 50.8198],
  manchester: [-2.2426, 53.4808], birmingham: [-1.8904, 52.4862],
  edinburgh: [-3.1883, 55.9533], glasgow: [-4.2518, 55.8642],
  paris: [2.3522, 48.8566], berlin: [13.405, 52.52],
  brussels: [4.3517, 50.8503], amsterdam: [4.9041, 52.3676],
  rome: [12.4964, 41.9028], madrid: [-3.7038, 40.4168],
  lisbon: [-9.1393, 38.7223], vienna: [16.3738, 48.2082],
  prague: [14.4378, 50.0755], warsaw: [21.0122, 52.2297],
  athens: [23.7275, 37.9838], istanbul: [28.9784, 41.0082],
  cairo: [31.2357, 30.0444], nairobi: [36.8219, -1.2921],
  cape_town: [18.4241, -33.9249], new_york: [-74.006, 40.7128],
  washington: [-77.0369, 38.9072], toronto: [-79.3832, 43.6532],
  mexico_city: [-99.1332, 19.4326], buenos_aires: [-58.3816, -34.6037],
  sydney: [151.2093, -33.8688], melbourne: [144.9631, -37.8136],
  tokyo: [139.6917, 35.6895], seoul: [126.978, 37.5665],
  beijing: [116.4074, 39.9042], shanghai: [121.4737, 31.2304],
  singapore: [103.8198, 1.3521], bangkok: [100.5018, 13.7563],
  delhi: [77.1025, 28.7041], mumbai: [72.8777, 19.076],
};

function normalised(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-GB");
}

function countryCode(expense: Expense): string {
  const original = expense.originalCountry?.toUpperCase();
  return original && original !== "UNKNOWN" ? original : expense.country.toUpperCase();
}

function previousPeriod(period: string): string {
  const date = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 2, 1));
  return date.toISOString().slice(0, 7);
}

function matchesFilters(expense: Expense, filters: StatisticsFilters): boolean {
  return (!filters.tripId || expense.tripId === filters.tripId) &&
    (!filters.mealContext || expense.mealContext === filters.mealContext) &&
    (!filters.country || countryCode(expense) === filters.country);
}

function periodExpenses(
  expenses: readonly Expense[],
  period: string,
  filters: StatisticsFilters,
): Expense[] {
  return expenses.filter((expense) =>
    !expense.deletedAt &&
    expense.date.startsWith(`${period}-`) &&
    matchesFilters(expense, filters));
}

function ranked(
  expenses: readonly Expense[],
  labelsFor: (expense: Expense) => string[],
): RankedStat[] {
  const groups = new Map<string, RankedStat>();
  for (const expense of expenses) {
    for (const labelValue of new Set(labelsFor(expense))) {
      const label = labelValue.trim() || "Not identified";
      const key = normalised(label);
      const item = groups.get(key) ?? { key, label, count: 0, totalPence: 0, expenseIds: [] };
      item.count += 1;
      item.totalPence += expense.eligibleAmountPence;
      item.expenseIds.push(expense.id);
      groups.set(key, item);
    }
  }
  return [...groups.values()].sort((a, b) =>
    b.count - a.count || b.totalPence - a.totalPence || a.label.localeCompare(b.label, "en-GB"));
}

function foodTypes(expense: Expense): string[] {
  const text = normalised([
    expense.merchant,
    ...(expense.lineItems ?? []).map((item) => item.description),
  ].join(" "));
  const matches: Array<[RegExp, string]> = [
    [/\b(cafe|coffee|espresso|latte|cappuccino|americano|tea)\b/, "Coffee & hot drinks"],
    [/\b(juice|smoothie|cola|lemonade|water|soft drink)\b/, "Cold drinks"],
    [/\b(sandwich|wrap|bagel|panini|sub|toastie)\b/, "Sandwiches & wraps"],
    [/\b(croissant|pastry|bakery|boulangerie|muffin|bread)\b/, "Bakery"],
    [/\b(pizza|pizzeria)\b/, "Pizza"],
    [/\b(burger|cheeseburger|mcdonald|five guys|shake shack)\b/, "Burgers"],
    [/\b(sushi|ramen|japanese|izakaya|teriyaki)\b/, "Japanese"],
    [/\b(indian|curry|tandoori|masala|biryani)\b/, "Indian"],
    [/\b(chinese|noodle|dim sum|wonton|chow mein)\b/, "Chinese & noodles"],
    [/\b(salad|fruit|vegetable|vegan|vegetarian)\b/, "Fresh & plant-based"],
    [/\b(cake|dessert|cookie|biscuit|chocolate|ice cream|snack|crisps)\b/, "Desserts & snacks"],
    [/\b(supermarket|tesco|sainsbury|waitrose|aldi|lidl|grocery|groceries)\b/, "Groceries"],
  ];
  const result = matches.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return result.length ? result : ["Other food"];
}

function resolveCoordinates(expense: Expense): Pick<MapPoint, "latitude" | "longitude" | "precision"> | null {
  if (expense.locationCoordinates) return expense.locationCoordinates;
  const location = normalised(expense.location).replaceAll("-", "_").replaceAll(" ", "_");
  const city = Object.entries(CITY_CENTRES).find(([name]) => location.includes(name));
  if (city) {
    return { longitude: city[1][0], latitude: city[1][1], precision: "city" };
  }
  const country = COUNTRY_CENTRES[countryCode(expense)];
  return country
    ? { longitude: country[0], latitude: country[1], precision: "country" }
    : null;
}

function mapPointRank(expenses: readonly Expense[]): MapPoint[] {
  const groups = new Map<string, MapPoint>();
  for (const expense of expenses) {
    const coordinates = resolveCoordinates(expense);
    if (!coordinates) continue;
    const coordinateKey = `${coordinates.latitude.toFixed(5)},${coordinates.longitude.toFixed(5)}`;
    const key = `${coordinateKey}|${coordinates.precision}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalPence += expense.eligibleAmountPence;
      existing.expenseIds.push(expense.id);
    } else {
      groups.set(key, {
        key,
        label: expense.location || expense.merchant,
        count: 1,
        totalPence: expense.eligibleAmountPence,
        expenseIds: [expense.id],
        ...coordinates,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.totalPence - a.totalPence);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function buildStatistics(
  expenses: readonly Expense[],
  claimPeriod: string,
  filters: StatisticsFilters = {},
): StatisticsModel {
  const selected = periodExpenses(expenses, claimPeriod, filters);
  const food = selected.filter((expense) => !expense.category || expense.category === "food");
  const days = new Date(Date.UTC(Number(claimPeriod.slice(0, 4)), Number(claimPeriod.slice(5, 7)), 0)).getUTCDate();
  const daily = Array.from({ length: days }, (_, index): DailyStat => {
    const date = `${claimPeriod}-${String(index + 1).padStart(2, "0")}`;
    const entries = selected.filter((expense) => expense.date === date);
    const foodEntries = entries.filter((expense) => !expense.category || expense.category === "food");
    return {
      date,
      day: index + 1,
      totalPence: entries.reduce((sum, expense) => sum + expense.eligibleAmountPence, 0),
      foodPence: foodEntries.reduce((sum, expense) => sum + expense.eligibleAmountPence, 0),
      claimablePence: entries.reduce((sum, expense) => sum + (expense.claimableAmountPence ?? 0), 0),
      count: entries.length,
      expenseIds: entries.map((expense) => expense.id),
    };
  });
  const totalPence = selected.reduce((sum, expense) => sum + expense.eligibleAmountPence, 0);
  const previousTotalPence = periodExpenses(expenses, previousPeriod(claimPeriod), filters)
    .reduce((sum, expense) => sum + expense.eligibleAmountPence, 0);
  const activeDays = daily.filter((day) => day.count).length;
  const withReceipt = selected.filter((expense) => expense.receiptStatus === "stored" || expense.receiptUrl).length;
  const locations = ranked(selected, (expense) => [expense.location || "Not identified"]);
  const mapPoints = mapPointRank(selected);
  const restaurants = ranked(food, (expense) => [expense.merchant]);
  return {
    expenses: selected,
    totalPence,
    claimablePence: selected.reduce((sum, expense) => sum + (expense.claimableAmountPence ?? 0), 0),
    previousTotalPence,
    changePercent: previousTotalPence
      ? Math.round(((totalPence - previousTotalPence) / previousTotalPence) * 100)
      : null,
    averageActiveDayPence: activeDays ? Math.round(totalPence / activeDays) : 0,
    medianReceiptPence: median(selected.map((expense) => expense.eligibleAmountPence)),
    receiptCoverage: selected.length ? Math.round((withReceipt / selected.length) * 100) : 0,
    uniqueRestaurants: restaurants.length,
    uniqueLocations: locations.length,
    restaurants,
    foodTypes: ranked(food, foodTypes),
    mealTypes: ranked(food, (expense) => {
      const context = expense.mealContext || "Not identified";
      return [context === "mixed" ? "Mixed meal" : context.charAt(0).toUpperCase() + context.slice(1)];
    }),
    currencies: ranked(selected, (expense) => [expense.originalCurrency || "GBP"]),
    daily,
    locations,
    mapPoints,
    preciseLocationCount: mapPoints.filter((point) => point.precision === "venue" || point.precision === "address")
      .reduce((sum, point) => sum + point.count, 0),
    countryOptions: [...new Set(selected.map(countryCode))].sort(),
  };
}
