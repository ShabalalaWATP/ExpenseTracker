import type { Principal } from "./principal";
import {
  convertMinorToPence,
  ecbCrossRateFromCsv,
  reduceRate,
  type ExactRate,
} from "./fx-reference";

const ECB_PROVIDER = "ECB";
const ECB_DATA_URL = "https://data-api.ecb.europa.eu/service/data/EXR";
const MAX_ECB_RESPONSE_BYTES = 512 * 1024;
const ECB_TIMEOUT_MS = 10_000;

export type ExchangeRateQuote = {
  id: string | null;
  provider: "ECB" | "identity";
  baseCurrency: string;
  quoteCurrency: "GBP";
  requestedDate: string;
  observationDate: string;
  rate: ExactRate;
  rateDisplay: string;
  providerReference: string;
  payloadSha256: string | null;
};

export type ReceiptConversion = {
  quoteId: string | null;
  provider: "ECB" | "identity";
  requestedDate: string;
  observationDate: string;
  originalCurrency: string;
  targetCurrency: "GBP";
  originalMinorUnitDigits: number;
  rateNumerator: string;
  rateDenominator: string;
  rateDisplay: string;
  receiptTotalMinor: number;
  eligibleMinor: number;
  gratuityMinor: number;
  receiptTotalPence: number;
  eligiblePence: number;
  gratuityPence: number;
};

type QuoteRow = {
  id: string;
  provider: string;
  base_currency: string;
  quote_currency: string;
  requested_date: string;
  observation_date: string;
  rate_numerator: string;
  rate_denominator: string;
  rate_display: string;
  provider_reference: string;
  payload_sha256: string;
};

function assertCurrency(value: string): void {
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new Error("Currency must be a canonical three-letter ISO code.");
  }
}

function assertIsoDate(value: string): void {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid receipt date.");
  }
}

function dateDaysBefore(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(value).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function boundedResponse(response: Response): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`ECB returned HTTP ${response.status}.`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ECB_RESPONSE_BYTES) {
    throw new Error("ECB response is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ECB returned no response body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_ECB_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("ECB response is too large.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function quoteFromRow(row: QuoteRow): ExchangeRateQuote {
  return {
    id: row.id,
    provider: "ECB",
    baseCurrency: row.base_currency,
    quoteCurrency: "GBP",
    requestedDate: row.requested_date,
    observationDate: row.observation_date,
    rate: reduceRate({
      numerator: BigInt(row.rate_numerator),
      denominator: BigInt(row.rate_denominator),
    }),
    rateDisplay: row.rate_display,
    providerReference: row.provider_reference,
    payloadSha256: row.payload_sha256,
  };
}

async function cachedQuote(
  principal: Principal,
  originalCurrency: string,
  requestedDate: string,
): Promise<ExchangeRateQuote | null> {
  const { database } = await import("./db");
  const row = await database()
    .prepare(
      `SELECT * FROM exchange_rate_quotes
       WHERE owner_id = ? AND provider = ? AND base_currency = ?
         AND quote_currency = 'GBP' AND requested_date = ?`,
    )
    .bind(principal.ownerId, ECB_PROVIDER, originalCurrency, requestedDate)
    .first<QuoteRow>();
  return row ? quoteFromRow(row) : null;
}

export async function exchangeRateToGbp(
  principal: Principal,
  originalCurrency: string,
  requestedDate: string,
): Promise<ExchangeRateQuote> {
  assertCurrency(originalCurrency);
  assertIsoDate(requestedDate);
  if (originalCurrency === "GBP") {
    return {
      id: null,
      provider: "identity",
      baseCurrency: "GBP",
      quoteCurrency: "GBP",
      requestedDate,
      observationDate: requestedDate,
      rate: { numerator: BigInt(1), denominator: BigInt(1) },
      rateDisplay: "1 GBP = 1 GBP",
      providerReference: "identity",
      payloadSha256: null,
    };
  }
  const cached = await cachedQuote(principal, originalCurrency, requestedDate);
  if (cached) return cached;

  const currencies =
    originalCurrency === "EUR" ? "GBP" : `${originalCurrency}+GBP`;
  const url = new URL(`${ECB_DATA_URL}/D.${currencies}.EUR.SP00.A`);
  url.searchParams.set("startPeriod", dateDaysBefore(requestedDate, 14));
  url.searchParams.set("endPeriod", requestedDate);
  url.searchParams.set("format", "csvdata");
  const response = await fetch(url, {
    headers: { Accept: "text/csv" },
    redirect: "error",
    signal: AbortSignal.timeout(ECB_TIMEOUT_MS),
  });
  const payload = await boundedResponse(response);
  const parsed = ecbCrossRateFromCsv(
    new TextDecoder("utf-8", { fatal: true }).decode(payload),
    originalCurrency,
    requestedDate,
  );
  const rateDisplay =
    `1 ${originalCurrency} = ` +
    `${Number(parsed.rate.numerator) / Number(parsed.rate.denominator)} GBP`;
  const { database } = await import("./db");
  await database()
    .prepare(
      `INSERT OR IGNORE INTO exchange_rate_quotes (
         id, owner_id, provider, base_currency, quote_currency,
         requested_date, observation_date, rate_numerator, rate_denominator,
         rate_display, provider_reference, payload_sha256
       ) VALUES (?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      principal.ownerId,
      ECB_PROVIDER,
      originalCurrency,
      requestedDate,
      parsed.observationDate,
      parsed.rate.numerator.toString(),
      parsed.rate.denominator.toString(),
      rateDisplay,
      url.toString(),
      await sha256(payload),
    )
    .run();
  const stored = await cachedQuote(principal, originalCurrency, requestedDate);
  if (!stored) throw new Error("The exchange-rate quote could not be cached.");
  return stored;
}

export async function convertReceiptToGbp(
  principal: Principal,
  input: {
    originalCurrency: string;
    serviceDate: string;
    originalMinorUnitDigits: number;
    receiptTotalMinor: number;
    eligibleMinor: number;
    gratuityMinor: number;
  },
): Promise<ReceiptConversion> {
  const quote = await exchangeRateToGbp(
    principal,
    input.originalCurrency,
    input.serviceDate,
  );
  const convert = (amount: number) =>
    convertMinorToPence(amount, input.originalMinorUnitDigits, quote.rate);
  return {
    quoteId: quote.id,
    provider: quote.provider,
    requestedDate: input.serviceDate,
    observationDate: quote.observationDate,
    originalCurrency: input.originalCurrency,
    targetCurrency: "GBP",
    originalMinorUnitDigits: input.originalMinorUnitDigits,
    rateNumerator: quote.rate.numerator.toString(),
    rateDenominator: quote.rate.denominator.toString(),
    rateDisplay: quote.rateDisplay,
    receiptTotalMinor: input.receiptTotalMinor,
    eligibleMinor: input.eligibleMinor,
    gratuityMinor: input.gratuityMinor,
    receiptTotalPence: convert(input.receiptTotalMinor),
    eligiblePence: convert(input.eligibleMinor),
    gratuityPence: convert(input.gratuityMinor),
  };
}
