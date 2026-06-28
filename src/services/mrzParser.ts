// Strict ICAO 9303 TD3 (passport) MRZ parser for the Phase 1 extraction
// service. Wraps the existing `parseMrz` and adds hard structural guards
// so we NEVER return partial / fabricated values for the 7 core fields.
//
// Phase 1 source-of-truth fields (MRZ only):
//   - Passport Number
//   - Surname
//   - Given Name
//   - Gender
//   - Date of Birth
//   - Nationality
//   - Date of Expiry

import {
  parseMrz as parseMrzRaw,
  extractMrzLines,
  MRZResult,
} from '@/lib/mrzParser';

export type MrzCoreFields = {
  passportNumber: string;
  surname: string;
  givenName: string;
  gender: string;
  dateOfBirth: string;
  nationality: string;
  dateOfExpiry: string;
};

export interface StrictMrzResult {
  /** All seven Phase-1 fields, or null when the MRZ is not confidently readable. */
  fields: MrzCoreFields | null;
  /** Underlying parse, for debugging/telemetry. */
  raw: MRZResult | null;
  /** Confidence in 0..1; only meaningful when fields !== null. */
  confidence: number;
}

/**
 * Parse OCR text against strict ICAO TD3 rules. Returns null fields on
 * any of:
 *  - MRZ lines not found
 *  - line 1 does not start with "P" (passport doc type)
 *  - name field lacks the `<<` surname/given separator
 *  - passport number, nationality, or DOB/expiry checksums fail
 *  - any required field is empty after parsing
 */
export function parseStrictMrz(text: string): StrictMrzResult {
  const lines = extractMrzLines(text);
  if (!lines) return { fields: null, raw: null, confidence: 0 };

  // Hard structural guards before trusting the parser.
  const [l1] = lines;
  if (!/^P/.test(l1)) return { fields: null, raw: null, confidence: 0 };
  const nameField = l1.slice(5, 44);
  if (!nameField.includes('<<')) return { fields: null, raw: null, confidence: 0 };

  const raw = parseMrzRaw(text);
  if (!raw) return { fields: null, raw: null, confidence: 0 };

  // Phase-1 acceptance: passport + DOB + expiry checksums MUST all pass.
  // Anything less means we don't trust the 7 fields enough to emit them.
  if (!raw.checks.passport || !raw.checks.dob || !raw.checks.expiry) {
    return { fields: null, raw, confidence: raw.confidence };
  }

  // Required-field sanity.
  if (
    !raw.passportNumber ||
    raw.passportNumber.length < 6 ||
    !raw.nationality ||
    raw.nationality.length !== 3 ||
    !raw.surname ||
    !raw.givenName ||
    !raw.gender ||
    !raw.dateOfBirth ||
    !raw.dateOfExpiry
  ) {
    return { fields: null, raw, confidence: raw.confidence };
  }

  return {
    fields: {
      passportNumber: raw.passportNumber,
      surname: raw.surname,
      givenName: raw.givenName,
      gender: raw.gender,
      dateOfBirth: raw.dateOfBirth,
      nationality: raw.nationality,
      dateOfExpiry: raw.dateOfExpiry,
    },
    raw,
    confidence: raw.confidence,
  };
}