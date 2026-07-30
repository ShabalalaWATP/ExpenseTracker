export type ExactRate = {
  numerator: bigint;
  denominator: bigint;
};

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function assertCurrency(value: string): void {
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new Error("Currency must be a canonical three-letter ISO code.");
  }
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;
  while (b !== BigInt(0)) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function reduceRate(rate: ExactRate): ExactRate {
  if (rate.numerator <= BigInt(0) || rate.denominator <= BigInt(0)) {
    throw new Error("Exchange rates must be positive.");
  }
  const divisor = greatestCommonDivisor(rate.numerator, rate.denominator);
  return {
    numerator: rate.numerator / divisor,
    denominator: rate.denominator / divisor,
  };
}

export function decimalRate(value: string): ExactRate {
  const match = /^(?:0|[1-9]\d*)(?:\.(\d{1,18}))?$/.exec(value.trim());
  if (!match) throw new Error("ECB returned an invalid rate.");
  const fraction = match[1] ?? "";
  const numerator = BigInt(value.replace(".", ""));
  return reduceRate({
    numerator,
    denominator: BigInt(10) ** BigInt(fraction.length),
  });
}

export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < BigInt(0) || denominator <= BigInt(0)) {
    throw new Error("Half-up division requires non-negative values.");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * BigInt(2) >= denominator
    ? quotient + BigInt(1)
    : quotient;
}

export function convertMinorToPence(
  amountMinor: number,
  minorUnitDigits: number,
  rate: ExactRate,
): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("The original amount must be a non-negative safe integer.");
  }
  if (
    !Number.isInteger(minorUnitDigits) ||
    minorUnitDigits < 0 ||
    minorUnitDigits > 4
  ) {
    throw new Error("The currency minor-unit precision is invalid.");
  }
  const reduced = reduceRate(rate);
  const converted = divideHalfUp(
    BigInt(amountMinor) * reduced.numerator * BigInt(100),
    reduced.denominator * BigInt(10) ** BigInt(minorUnitDigits),
  );
  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("The converted amount is too large.");
  }
  return Number(converted);
}

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("ECB returned malformed CSV.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export function ecbCrossRateFromCsv(
  csv: string,
  originalCurrency: string,
  requestedDate: string,
): { observationDate: string; rate: ExactRate } {
  assertCurrency(originalCurrency);
  if (!validIsoDate(requestedDate)) throw new Error("Invalid receipt date.");
  const rows = csvRows(csv);
  const header = rows.shift()?.map((value) => value.trim().toUpperCase()) ?? [];
  const currencyColumn = header.indexOf("CURRENCY");
  const dateColumn = header.indexOf("TIME_PERIOD");
  const valueColumn = header.indexOf("OBS_VALUE");
  if (currencyColumn < 0 || dateColumn < 0 || valueColumn < 0) {
    throw new Error("ECB response is missing required fields.");
  }
  const observations = new Map<string, Map<string, ExactRate>>();
  for (const row of rows) {
    const currency = row[currencyColumn]?.trim().toUpperCase();
    const date = row[dateColumn]?.trim();
    const value = row[valueColumn]?.trim();
    if (
      !currency ||
      !date ||
      !value ||
      !validIsoDate(date) ||
      date > requestedDate ||
      (currency !== originalCurrency && currency !== "GBP")
    ) {
      continue;
    }
    const onDate = observations.get(date) ?? new Map<string, ExactRate>();
    onDate.set(currency, decimalRate(value));
    observations.set(date, onDate);
  }
  for (const date of [...observations.keys()].sort().reverse()) {
    const onDate = observations.get(date)!;
    const originalPerEuro =
      originalCurrency === "EUR"
        ? { numerator: BigInt(1), denominator: BigInt(1) }
        : onDate.get(originalCurrency);
    const poundsPerEuro = onDate.get("GBP");
    if (!originalPerEuro || !poundsPerEuro) continue;
    return {
      observationDate: date,
      rate: reduceRate({
        numerator: poundsPerEuro.numerator * originalPerEuro.denominator,
        denominator: poundsPerEuro.denominator * originalPerEuro.numerator,
      }),
    };
  }
  throw new Error(
    "ECB has no reference rate for this currency on or before the receipt date.",
  );
}
