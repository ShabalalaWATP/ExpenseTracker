import type { FoodStyleTag } from "../../src/domain/food-style";

export type ViewName =
  | "today"
  | "capture"
  | "calendar"
  | "expenses"
  | "trips"
  | "claims"
  | "statistics"
  | "audit"
  | "policy"
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

export interface ReceiptTranslation {
  merchantEnglish?: string;
  locationEnglish?: string;
  summaryEnglish?: string;
}

export interface CurrencyConversion {
  status?: string;
  source: string;
  observationDate: string;
  rateDisplay: string;
  providerReference: string;
  rounding: string;
}

export interface OriginalReceiptFacts {
  originalCurrency?: string;
  originalCountry?: string;
  originalLanguage?: string;
  originalReceiptTotalMinor?: number;
  originalEligibleMinor?: number;
  originalGratuityMinor?: number;
  originalMinorUnitDigits?: number;
  translation?: ReceiptTranslation;
  conversion?: CurrencyConversion;
  tripLegId?: string | null;
  locationCoordinates?: {
    latitude: number;
    longitude: number;
    precision: "venue" | "address" | "city" | "country";
    evidence?: string | null;
  } | null;
  foodStyleTags?: FoodStyleTag[];
  lineItems?: Array<{
    description: string;
    quantity?: number | null;
    totalPence?: number | null;
    eligible?: boolean | null;
  }>;
}

export interface Expense extends OriginalReceiptFacts {
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

export interface TripLeg {
  id?: string;
  sequence: number;
  countryCode: string;
  location: string;
  startDate: string;
  endDate: string;
}

export interface Trip {
  id: string;
  title: string;
  location: string;
  justification?: string;
  country: string;
  startDate: string;
  endDate: string;
  eligibleDates?: string[];
  calculationMethod?: "daily" | "aggregate";
  attested?: boolean;
  legs: TripLeg[];
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
  claimPeriod: string;
  date?: string;
  dailyCapPence: number;
  spentTodayPence: number;
  claimableTodayPence: number;
  remainingTodayPence: number;
  actualPence: number;
  claimablePence: number;
  excessPence: number;
  pendingReceiptCount: number;
  pendingEstimatedEligiblePence: number;
  undatedPendingCount: number;
  confirmedEligiblePence: number;
  policyEligiblePence: number;
  overLimitPence: number;
  blockedConfirmedPence: number;
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
  country: string;
  location: string;
  reason: string;
  mealContext?: MealContext;
  category?: ExpenseCategory;
  tripId?: string;
}

export interface TripDraft {
  title: string;
  location: string;
  justification: string;
  country: string;
  startDate: string;
  endDate: string;
  legs: TripLeg[];
  eligibleDates: string[];
  attested: boolean;
  calculationMethod: "daily" | "aggregate";
}
