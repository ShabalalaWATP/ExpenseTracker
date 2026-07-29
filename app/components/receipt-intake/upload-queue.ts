import type { BatchDefaults, ReceiptIntake } from "./types";

export const MAX_UPLOAD_BATCH = 20;

export type BatchDefaultState = {
  seed: string;
  value: BatchDefaults;
};

export function initialBatchDefaultState(seed: string): BatchDefaultState {
  return {
    seed,
    value: {
      serviceDate: seed,
      location: "",
      businessReason: "",
      tripId: "",
      mealContext: "",
    },
  };
}

export function currentBatchDefaults(
  state: BatchDefaultState,
  seed: string,
): BatchDefaults {
  return state.seed === seed
    ? state.value
    : { ...state.value, serviceDate: seed };
}

export function uploadIdentifier(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function upsertReceiptIntake(
  items: readonly ReceiptIntake[],
  next: ReceiptIntake,
): ReceiptIntake[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items];
}
