// @ts-expect-error Node's TypeScript stripping requires the source extension.
import {
  allocatedReceiptLineTotal,
  receiptLineQuantity,
  type GroupReceiptLine,
} from "./group-receipt.ts";

export type GroupReceiptAllocationMethod = "items" | "equal";

export type AllocatableReceiptLine = GroupReceiptLine & {
  groupOriginalEligible?: boolean | null;
};

export type GroupReceiptAllocation = {
  totalPence: number;
  serviceChargeSharePence: number;
  lineClaimsPence: number[];
  selectedItems: number[];
};

export function isServiceChargeLine(description: string): boolean {
  return /(?:service\s*charge|gratuity|\btip\b|(?:^|\s)\+?\s*s\s*\/\s*c(?:\s|$))/i.test(
    description,
  );
}

function originallyEligible(line: AllocatableReceiptLine): boolean {
  return (
    line.alcoholSuspected !== true &&
    (line.groupOriginalEligible ?? line.eligible) !== false
  );
}

function equalClaims(
  lines: readonly AllocatableReceiptLine[],
  peopleCount: number,
): number[] {
  const claims = lines.map((line) =>
    originallyEligible(line) && Number.isSafeInteger(line.totalPence)
      ? Math.round(Number(line.totalPence) / peopleCount)
      : 0,
  );
  const fullTotal = lines.reduce(
    (sum, line) =>
      sum +
      (originallyEligible(line) && Number.isSafeInteger(line.totalPence)
        ? Number(line.totalPence)
        : 0),
    0,
  );
  const target = Math.round(fullTotal / peopleCount);
  const adjustment = target - claims.reduce((sum, value) => sum + value, 0);
  const adjustmentIndex = lines.findIndex(
    (line) => originallyEligible(line) && isServiceChargeLine(line.description),
  );
  const fallbackIndex = lines.findLastIndex(originallyEligible);
  const index = adjustmentIndex >= 0 ? adjustmentIndex : fallbackIndex;
  if (index >= 0) claims[index] += adjustment;
  return claims;
}

export function allocateGroupReceipt(input: {
  lines: readonly AllocatableReceiptLine[];
  selectedQuantities: readonly number[];
  peopleCount: number;
  method: GroupReceiptAllocationMethod;
  serviceChargePence: number;
}): GroupReceiptAllocation {
  const peopleCount = Math.min(20, Math.max(1, Math.trunc(input.peopleCount)));
  const serviceChargeSharePence = Math.round(
    Math.max(0, input.serviceChargePence) / peopleCount,
  );
  const lineClaimsPence =
    input.method === "equal"
      ? equalClaims(input.lines, peopleCount)
      : input.lines.map((line, index) => {
          if (!originallyEligible(line) || isServiceChargeLine(line.description)) {
            return 0;
          }
          return allocatedReceiptLineTotal(
            line.totalPence,
            receiptLineQuantity(line),
            input.selectedQuantities[index] ?? 0,
          );
        });

  if (input.method === "items" && serviceChargeSharePence > 0) {
    const serviceIndex = input.lines.findIndex(
      (line) => originallyEligible(line) && isServiceChargeLine(line.description),
    );
    if (serviceIndex >= 0) lineClaimsPence[serviceIndex] = serviceChargeSharePence;
  }

  const selectedItems = lineClaimsPence.flatMap((value, index) =>
    value !== 0 ? [index] : [],
  );
  const itemTotal = lineClaimsPence.reduce((sum, value) => sum + value, 0);
  const representedServiceCharge = input.lines.some(
    (line) => originallyEligible(line) && isServiceChargeLine(line.description),
  );
  const totalPence = representedServiceCharge
    ? itemTotal
    : itemTotal + serviceChargeSharePence;
  return {
    totalPence,
    serviceChargeSharePence,
    lineClaimsPence,
    selectedItems,
  };
}
