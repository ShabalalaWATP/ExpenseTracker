export const EXPENSE_CATEGORIES = [
  "food",
  "taxi",
  "public_transport",
  "parking",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "food";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: "Food & drink",
  taxi: "Taxi",
  public_transport: "Public transport",
  parking: "Parking",
  other: "Other",
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function normaliseCategory(value: unknown): ExpenseCategory | null {
  return isExpenseCategory(value) ? value : null;
}

/** Only food and drink consumes the JSP 752 daily subsistence allowance. */
export function countsTowardDailyCap(category: string | null | undefined): boolean {
  return !category || category === "food";
}
