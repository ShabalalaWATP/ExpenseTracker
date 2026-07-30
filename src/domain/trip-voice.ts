export type TripVoiceLeg = {
  countryCode: string;
  location: string;
  startDate: string;
  endDate: string;
};

export type TripVoiceDraft = {
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  legs: TripVoiceLeg[] | null;
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
  startDate: null,
  endDate: null,
  legs: null,
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

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function normaliseLegs(value: unknown): TripVoiceLeg[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    return undefined;
  }
  const legs: TripVoiceLeg[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return undefined;
    }
    const leg = item as Record<string, unknown>;
    const location = cleanText(leg.location, 160);
    if (
      typeof location !== "string" ||
      typeof leg.countryCode !== "string" ||
      !/^[A-Z]{2}$/.test(leg.countryCode) ||
      !isDate(leg.startDate) ||
      !isDate(leg.endDate) ||
      leg.endDate < leg.startDate
    ) {
      return undefined;
    }
    legs.push({
      countryCode: leg.countryCode,
      location,
      startDate: leg.startDate,
      endDate: leg.endDate,
    });
  }
  return legs;
}

function normaliseField(
  field: keyof TripVoiceDraft,
  value: unknown,
): TripVoiceDraft[keyof TripVoiceDraft] | undefined {
  if (value === null) return null;
  switch (field) {
    case "title":
      return cleanText(value, 120);
    case "startDate":
    case "endDate":
      return isDate(value) ? value : undefined;
    case "legs":
      return normaliseLegs(value);
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
    ["startDate", "start date"],
    ["endDate", "end date"],
    ["legs", "complete ordered itinerary"],
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
  if (draft.startDate && draft.endDate && draft.legs?.length) {
    if (
      draft.legs[0].startDate !== draft.startDate ||
      draft.legs[draft.legs.length - 1].endDate !== draft.endDate
    ) {
      issues.push({
        field: "legs",
        message: "The itinerary must cover the complete trip date range.",
      });
    } else {
      for (let index = 0; index < draft.legs.length; index += 1) {
        const leg = draft.legs[index];
        const previous = draft.legs[index - 1];
        if (
          leg.startDate < draft.startDate ||
          leg.endDate > draft.endDate ||
          leg.endDate < leg.startDate ||
          (previous &&
            leg.startDate !== previous.endDate &&
            leg.startDate !== nextDate(previous.endDate))
        ) {
          issues.push({
            field: "legs",
            message:
              "Itinerary legs must be chronological, without gaps or overlaps beyond one transition date.",
          });
          break;
        }
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
    .replace(/[’']/g, "")
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
    "im happy",
    "im happy with that",
    "i am happy",
    "i am happy with that",
    "happy with that",
    "that sounds good",
    "sounds good",
    "that looks good",
    "looks good to me",
    "thats right",
    "that is right",
    "oui",
    "oui enregistrez le voyage",
    "oui enregistrez ce voyage",
    "enregistrez le voyage",
    "sí",
    "si",
    "sí guarda el viaje",
    "si guarda el viaje",
    "guardar el viaje",
    "ja",
    "ja reise speichern",
    "reise speichern",
    "sì",
    "si salva il viaggio",
    "salva il viaggio",
    "sim",
    "sim guarde a viagem",
    "guarde a viagem",
  ]).has(clean);
}

export const TRIP_VOICE_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: ["string", "null"], minLength: 1, maxLength: 120 },
    startDate: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    endDate: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    legs: {
      type: ["array", "null"],
      minItems: 1,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          countryCode: {
            type: "string",
            pattern: "^[A-Z]{2}$",
          },
          location: { type: "string", minLength: 1, maxLength: 160 },
          startDate: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          },
          endDate: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          },
        },
        required: ["countryCode", "location", "startDate", "endDate"],
      },
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
