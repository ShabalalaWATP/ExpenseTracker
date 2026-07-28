export type ViewName =
  | "today"
  | "capture"
  | "expenses"
  | "trips"
  | "claims"
  | "settings";

export type MealContext =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "mixed"
  | "";

export interface Expense {
  id: string;
  date: string;
  merchant: string;
  receiptTotalPence: number;
  eligibleAmountPence: number;
  claimableAmountPence?: number;
  country: string;
  location: string;
  reason: string;
  mealContext?: MealContext;
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
  attention: Array<{ id?: string; title: string; detail?: string }>;
  expenses: Expense[];
  trips: Trip[];
  claims: Claim[];
}

export interface ExpenseDraft {
  date: string;
  merchant: string;
  receiptTotalPence: number;
  eligibleAmountPence: number;
  country: "GB";
  location: string;
  reason: string;
  mealContext?: MealContext;
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
