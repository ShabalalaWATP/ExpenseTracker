# ADR 0001: International receipts and multi-country trips

Status: Accepted  
Date: 30 July 2026

## Context

ExpenseTracker originally treated every receipt as UK evidence denominated in
GBP. That was simple for the launch claim, but it could not faithfully record a
foreign receipt. A foreign amount could be lost or, during manual confirmation,
mistakenly represented as pounds.

Trips were also represented by one country and one date range. That cannot
describe a journey that crosses national borders, and date-only matching cannot
reliably identify the itinerary leg associated with a receipt.

The product should minimise routine owner input while preserving a defensible
evidence trail. AI can interpret multilingual receipt images, but financial
conversion and policy calculation must remain deterministic and reproducible.

## Decision

### Preserve original evidence separately from the claim ledger

For each receipt intake and confirmed expense, preserve:

- the original ISO 4217 currency code;
- the original ISO 3166-1 alpha-2 purchase country;
- the detected BCP 47 language;
- the original receipt, eligible and gratuity amounts in the currency's minor
  unit;
- a structured English translation of material receipt facts;
- the immutable receipt image and its integrity metadata.

The existing GBP integer fields remain the policy ledger values used by JSP 752
calculations. They do not overwrite or masquerade as the original values.

### Use two independent AI reads for unattended confirmation

The configured frontier vision model performs a primary structured extraction
and a separate image-only verification. Both passes must independently agree on
the original date, amount, currency and country before a foreign receipt can be
confirmed without owner review.

Receipt text is untrusted input. Model confidence alone is not authority to
create a claim. Any disagreement, missing printed evidence, instruction-like
content, arithmetic failure, possible duplicate, trip ambiguity or policy
exception sends the receipt to the exception inbox.

The primary read also produces a structured English translation. The original
text and image remain authoritative evidence.

### Convert with an immutable, deterministic FX quote

The server resolves an official ECB reference rate for the receipt date. If that
date has no published observation, it uses the latest published observation on
or before the receipt date within the bounded lookup window.

Each rate is stored once with:

- provider and observation date;
- base and quote currencies;
- an exact integer numerator and denominator;
- provider reference and response hash;
- the deterministic rounding rule.

Conversion uses integer rational arithmetic and rounds to the nearest penny,
half away from zero. The AI never calculates or supplies the exchange rate.

ECB reference rates are indicative rather than transaction rates. The app must
show their source and date and preserve the frozen value used for the claim.
If a required rate is unavailable, the receipt remains in exception review
instead of silently assuming GBP. The owner may then supply the GBP equivalent
as a clearly labelled exception. That value is stored with
`provider = owner`, no official quote ID and owner provenance, and it cannot be
unattendedly confirmed. If the AI repeatedly returns an unknown country or
currency, the owner may correct only the missing ISO code; the server then
retries the same deterministic conversion and records that correction.

### Represent trips as ordered itinerary legs

Trips retain their existing envelope, eligible days and aggregation election.
They gain one or more ordered legs, each with:

- location;
- country;
- inclusive start date;
- inclusive end date.

Existing trips receive one legacy GB leg. New trip dates are derived from the
leg envelope. Voice creation collects and reads back the complete itinerary,
but retains an explicit final save confirmation because it creates a material
record.

Automatic receipt matching identifies a unique eligible itinerary leg using the
receipt date and, when known, country. A same-day border crossing or any other
multiple match is an exception. It is never resolved by a fuzzy AI guess.

## Consequences

- Foreign evidence is never silently relabelled as GBP or GB.
- The GBP claim remains reproducible after exchange rates or model behaviour
  change.
- Most clear receipts can flow from upload to ledger without manual field
  confirmation.
- Owners see original and GBP values together in review, exports, claim
  packages and audit reports.
- Multi-country trips can be created manually or by Realtime voice and support
  exact receipt-to-leg linkage.
- FX availability and ambiguous itinerary dates introduce explicit review
  states.
- The original receipt, not its translation, remains the primary audit
  evidence.

## References

- [OpenAI image and vision inputs](https://platform.openai.com/docs/guides/images-vision)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [ECB Data Portal API](https://data.ecb.europa.eu/help/api/overview)
- [ECB euro foreign exchange reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
