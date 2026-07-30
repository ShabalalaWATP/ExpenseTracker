export type ViewName =
  | "today"
  | "capture"
  | "calendar"
  | "expenses"
  | "trips"
  | "claims"
  | "settings";

export type NavigationTarget = {
  view: ViewName;
  intakeId?: string;
  expenseId?: string;
  tripId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
};

export type MealContext =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "mixed"
  | "";

export type ExpenseCategory =
  | "food"
  | "taxi"
  | "public_transport"
  | "parking"
  | "other";

export const EXPENSE_CATEGORY_OPTIONS: Array<{
  value: ExpenseCategory;
  label: string;
}> = [
  { value: "food", label: "Food & drink" },
  { value: "taxi", label: "Taxi" },
  { value: "public_transport", label: "Public transport" },
  { value: "parking", label: "Parking" },
  { value: "other", label: "Other" },
];

export function categoryLabel(value: string | null | undefined): string {
  return (
    EXPENSE_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ??
    "Food & drink"
  );
}

export interface Expense {
  id: string;
  date: string;
  merchant: string;
  receiptTotalPence: number;
  eligibleAmountPence: number;
  gratuityPence?: number;
  claimableAmountPence?: number;
  country: string;
  location: string;
  reason: string;
  mealContext?: MealContext;
  category?: ExpenseCategory;
  tripId?: string;
  receiptStatus?: string;
  receiptUrl?: string;
  readiness?: string;
  submitted?: boolean;
  locked?: boolean;
  deletedAt?: string | null;
}

export interface Trip {
  id: string;
  title: string;
  location: string;
  country: string;
  startDate: string;
  endDate: string;
  eligibleDates?: string[];
  calculationMethod?: "daily" | "aggregate";
  attested?: boolean;
}

export interface Claim {
  id: string;
  period?: string;
  status?: string;
  actualPence?: number;
  claimablePence?: number;
  excessPence?: number;
  preparedAt?: string;
}

export interface DashboardData {
  date?: string;
  dailyCapPence: number;
  spentTodayPence: number;
  claimableTodayPence: number;
  remainingTodayPence: number;
  actualPence: number;
  claimablePence: number;
  excessPence: number;
  claimReady: boolean;
  attention: Array<{
    id: string;
    code?: string;
    category?: "evidence" | "details" | "trip" | "policy";
    severity?: "blocking" | "warning";
    title: string;
    detail?: string;
    view?: ViewName;
    target?: NavigationTarget;
  }>;
  expenses: Expense[];
  deletedExpenses: Expense[];
  trips: Trip[];
  claims: Claim[];
}

export interface ExpenseDraft {
  date: string;
  merchant: string;
  receiptTotalPence: number;
  eligibleAmountPence: number;
  gratuityPence?: number;
  country: "GB";
  location: string;
  reason: string;
  mealContext?: MealContext;
  category?: ExpenseCategory;
  tripId?: string;
}

export interface TripDraft {
  title: string;
  location: string;
  country: "GB";
  startDate: string;
  endDate: string;
  eligibleDates: string[];
  attested: boolean;
  calculationMethod: "daily" | "aggregate";
}
