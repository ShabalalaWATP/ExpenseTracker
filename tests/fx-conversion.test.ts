import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { convertMinorToPence, decimalRate, divideHalfUp, ecbCrossRateFromCsv } from "../src/server/fx-reference.ts";

describe("deterministic foreign-currency conversion", () => {
  it("rounds exact rational values to GBP pence using half-up", () => {
    assert.equal(divideHalfUp(BigInt(1), BigInt(2)), BigInt(1));
    assert.equal(divideHalfUp(BigInt(4), BigInt(3)), BigInt(1));
    assert.equal(
      convertMinorToPence(1_005, 2, {
        numerator: BigInt(1),
        denominator: BigInt(2),
      }),
      503,
    );
    assert.equal(
      convertMinorToPence(1_234, 0, {
        numerator: BigInt(3),
        denominator: BigInt(2),
      }),
      185_100,
    );
  });

  it("preserves decimal ECB rates as reduced exact fractions", () => {
    assert.deepEqual(decimalRate("1.2500"), {
      numerator: BigInt(5),
      denominator: BigInt(4),
    });
  });

  it("uses the latest common ECB business day on or before the receipt date", () => {
    const csv = [
      "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE",
      "x,D,USD,EUR,SP00,A,2026-07-24,1.2000",
      "x,D,GBP,EUR,SP00,A,2026-07-24,0.8000",
      "x,D,USD,EUR,SP00,A,2026-07-27,1.2500",
      "x,D,GBP,EUR,SP00,A,2026-07-27,0.7500",
      "x,D,USD,EUR,SP00,A,2026-07-28,1.3000",
    ].join("\n");
    assert.deepEqual(ecbCrossRateFromCsv(csv, "USD", "2026-07-28"), {
      observationDate: "2026-07-27",
      rate: { numerator: BigInt(3), denominator: BigInt(5) },
    });
  });

  it("derives EUR to GBP without requiring an EUR observation row", () => {
    const csv = [
      "CURRENCY,TIME_PERIOD,OBS_VALUE",
      "GBP,2026-07-29,0.875",
    ].join("\n");
    assert.deepEqual(ecbCrossRateFromCsv(csv, "EUR", "2026-07-29"), {
      observationDate: "2026-07-29",
      rate: { numerator: BigInt(7), denominator: BigInt(8) },
    });
  });
});
