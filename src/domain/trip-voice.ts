export type TripVoiceDraft = {
  title: string | null;
  location: string | null;
  country: "GB" | null;
  startDate: string | null;
  endDate: string | null;
  calculationMethod: "daily" | "aggregate" | null;
  eligibleDates: string[] | null;
  eligibilityAttested: boolean | null;
};

export type TripVoiceDraftIssue = {
  field: keyof TripVoiceDraft;
  message: string;
};

export const EMPTY_TRIP_VOICE_DRAFT: TripVoiceDraft = {
  title: null,
  location: null,
  country: null,
  startDate: null,
  endDate: null,
  calculationMethod: null,
  eligibleDates: null,
  eligibilityAttested: null,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VOICE_FIELDS = Object.keys(
  EMPTY_TRIP_VOICE_DRAFT,
) as Array<keyof TripVoiceDraft>;

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function cleanText(value: unknown, maximum: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= maximum ? clean : undefined;
}

function dateSpan(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000,
  );
}

function normaliseField(
  field: keyof TripVoiceDraft,
  value: unknown,
): TripVoiceDraft[keyof TripVoiceDraft] | undefined {
  if (value === null) return null;
  switch (field) {
    case "title":
      return cleanText(value, 120);
    case "location":
      return cleanText(value, 160);
    case "country":
      return value === "GB" ? value : undefined;
    case "startDate":
    case "endDate":
      return isDate(value) ? value : undefined;
    case "calculationMethod":
      return value === "daily" || value === "aggregate" ? value : undefined;
    case "eligibleDates":
      if (
        !Array.isArray(value) ||
        value.length > 370 ||
        !value.every(isDate)
      ) {
        return undefined;
      }
      return [...new Set(value)].sort();
    case "eligibilityAttested":
      return typeof value === "boolean" ? value : undefined;
  }
}

export function mergeTripVoiceDraft(
  current: TripVoiceDraft,
  patch: unknown,
): { draft: TripVoiceDraft; rejectedFields: Array<keyof TripVoiceDraft> } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { draft: current, rejectedFields: VOICE_FIELDS };
  }
  const input = patch as Record<string, unknown>;
  const draft = { ...current };
  const rejectedFields: Array<keyof TripVoiceDraft> = [];
  for (const field of VOICE_FIELDS) {
    if (!(field in input)) continue;
    const value = normaliseField(field, input[field]);
    if (value === undefined) {
      rejectedFields.push(field);
      continue;
    }
    Object.assign(draft, { [field]: value });
  }
  return { draft, rejectedFields };
}

export function tripVoiceDraftIssues(
  draft: TripVoiceDraft,
): TripVoiceDraftIssue[] {
  const issues: TripVoiceDraftIssue[] = [];
  for (const [field, label] of [
    ["title", "trip title"],
    ["location", "UK town or duty station"],
    ["country", "country"],
    ["startDate", "start date"],
    ["endDate", "end date"],
    ["calculationMethod", "calculation method"],
    ["eligibleDates", "eligible dates"],
    ["eligibilityAttested", "eligibility confirmation"],
  ] as const) {
    if (
      draft[field] === null ||
      (Array.isArray(draft[field]) && draft[field].length === 0)
    ) {
      issues.push({ field, message: `Ask for the ${label}.` });
    }
  }

  if (draft.country !== null && draft.country !== "GB") {
    issues.push({
      field: "country",
      message: "Only United Kingdom trips are supported.",
    });
  }
  if (
    draft.startDate &&
    draft.endDate &&
    draft.endDate < draft.startDate
  ) {
    issues.push({
      field: "endDate",
      message: "The end date cannot be before the start date.",
    });
  }
  if (draft.startDate && draft.endDate && draft.eligibleDates) {
    for (const date of draft.eligibleDates) {
      if (date < draft.startDate || date > draft.endDate) {
        issues.push({
          field: "eligibleDates",
          message: "Every eligible date must fall within the trip.",
        });
        break;
      }
    }
  }
  if (
    draft.calculationMethod === "aggregate" &&
    draft.startDate &&
    draft.endDate &&
    draft.endDate >= draft.startDate &&
    dateSpan(draft.startDate, draft.endDate) < 2
  ) {
    issues.push({
      field: "calculationMethod",
      message: "Aggregation requires a trip of at least two nights.",
    });
  }
  if (draft.eligibilityAttested === false) {
    issues.push({
      field: "eligibilityAttested",
      message: "The eligible-date conditions have not been confirmed.",
    });
  }
  return issues;
}

export function isTripVoiceDraftComplete(draft: TripVoiceDraft): boolean {
  return tripVoiceDraftIssues(draft).length === 0;
}

export function isExplicitTripSaveConfirmation(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[.,!?]+/g, "")
    .replace(/\s+/g, " ");
  return new Set([
    "yes",
    "yes please",
    "yes save it",
    "yes save this trip",
    "yes please save it",
    "yes please save the trip",
    "save it",
    "save this trip",
    "save the trip",
    "confirm",
    "confirm and save",
    "confirm and save this trip",
    "go ahead",
    "go ahead and save it",
    "go ahead and save the trip",
  ]).has(clean);
}

export const TRIP_VOICE_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: ["string", "null"], minLength: 1, maxLength: 120 },
    location: { type: ["string", "null"], minLength: 1, maxLength: 160 },
    country: { type: ["string", "null"], enum: ["GB", null] },
    startDate: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    endDate: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    calculationMethod: {
      type: ["string", "null"],
      enum: ["daily", "aggregate", null],
    },
    eligibleDates: {
      type: ["array", "null"],
      items: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      maxItems: 370,
    },
    eligibilityAttested: { type: ["boolean", "null"] },
  },
  required: VOICE_FIELDS,
} as const;
