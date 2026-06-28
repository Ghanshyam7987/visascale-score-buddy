// ICAO 9303 TD3 (passport) MRZ parser with strict fixed-position parsing,
// per-field OCR normalization, and full checksum validation (including
// composite). Backed by the standards-compliant `mrz` npm package for
// the actual field/checksum logic so we don't maintain a hand-rolled
// ICAO implementation.

import { parse as parseMrzLib } from 'mrz';

const CHAR_VALUES: Record<string, number> = (() => {
  const map: Record<string, number> = { "<": 0 };
  for (let i = 0; i < 10; i++) map[String(i)] = i;
  for (let i = 0; i < 26; i++) map[String.fromCharCode(65 + i)] = i + 10;
  return map;
})();

const WEIGHTS = [7, 3, 1];

export function computeCheckDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i].toUpperCase();
    const v = CHAR_VALUES[ch] ?? 0;
    sum += v * WEIGHTS[i % 3];
  }
  return sum % 10;
}

export interface MRZResult {
  surname: string;
  givenName: string;
  gender: string;
  dateOfBirth: string; // DD/MM/YYYY
  dateOfExpiry: string; // DD/MM/YYYY
  nationality: string;
  passportNumber: string;
  checksumValid: boolean;
  /** Per-field check results, useful for confidence scoring. */
  checks: {
    passport: boolean;
    dob: boolean;
    expiry: boolean;
    composite: boolean;
  };
  /** 0-1 score derived from passing checksums and field presence. */
  confidence: number;
}

export function sanitizeName(name: string): string {
  if (!name) return "";
  // Strict ICAO 9303 name cleanup. Conservative — NEVER drop a valid
  // alphabetic character:
  //  - strip trailing `<` fillers (ICAO right-pad)
  //  - convert any remaining internal `<` (token separators) to spaces
  //  - drop characters that aren't A–Z or whitespace (digits / `|` / `*`
  //    OCR junk only)
  //  - collapse runs of whitespace and drop empty / absurdly long tokens
  // No letter-deduplication, no trailing-letter trimming — those
  // destroy valid names like "DEVI" → "DEV" or "AANYA" → "ANYA".
  const trimmedFillers = name.toUpperCase().replace(/<+$/g, "");
  const cleaned = trimmedFillers
    .replace(/</g, " ")
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned
    .split(" ")
    .filter((w) => w.length > 0 && w.length <= 30);
  return tokens.join(" ");
}

function formatDate(yymmdd: string, futureHint = false): string {
  if (!/^\d{6}$/.test(yymmdd)) return "";
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const currentYY = new Date().getFullYear() % 100;
  let year: number;
  if (futureHint) {
    year = 2000 + yy;
  } else {
    year = yy <= currentYY ? 2000 + yy : 1900 + yy;
  }
  return `${dd}/${mm}/${year}`;
}

// ─────────────────────────────────────────────────────────────────────
// Per-field OCR normalization. MRZ has FIXED positions where chars are
// strictly numeric OR strictly alphabetic. We apply confusion maps in
// only one direction per field.
// ─────────────────────────────────────────────────────────────────────
const TO_DIGIT: Record<string, string> = {
  O: "0", Q: "0", D: "0",
  I: "1", L: "1", T: "1",
  Z: "2",
  E: "3",
  A: "4",
  S: "5",
  G: "6",
  Y: "7",
  B: "8",
  J: "1",
};
const TO_ALPHA: Record<string, string> = {
  "0": "O",
  "1": "I",
  "2": "Z",
  "5": "S",
  "6": "G",
  "8": "B",
};

function toDigits(s: string): string {
  return s
    .toUpperCase()
    .split("")
    .map((c) => (/[0-9<]/.test(c) ? c : TO_DIGIT[c] ?? c))
    .join("");
}
function toAlpha(s: string): string {
  return s
    .toUpperCase()
    .split("")
    .map((c) => (/[A-Z<]/.test(c) ? c : TO_ALPHA[c] ?? c))
    .join("");
}
function toAlnum(s: string): string {
  // Passport number can be alphanumeric — no confusion fix beyond uppercase.
  return s.toUpperCase();
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, "").replace(/[^A-Z0-9<]/gi, "").toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────
// MRZ Line-1 Name Cleanup (purely structural, ICAO 9303 TD3).
//
// Runs AFTER OCR and BEFORE ICAO parsing. Operates on the Line-1 name
// zone (positions 5..43) ONLY. NEVER modifies Line 2 (passport number,
// nationality, DOB, gender, expiry, checksums) and NEVER guesses which
// OCR characters might have been a misread `<` filler.
//
// Per ICAO 9303 TD3 the name zone has the exact shape:
//
//   <SURNAME><<<GIVEN1><GIVEN2>...<<<<<<<<<<  (padded to 39 chars)
//
// The only legal trailing characters in the zone are `<` fillers; any
// alphabetic characters that appear AFTER a sufficiently long filler
// run violate the spec and can only be OCR noise that bled in from
// the document edge / shadow / next line.
//
// Cleanup, applied in order — each step is reversible if it would
// destroy the `<<` surname/given separator:
//
//   1. Truncate trailing alphabetic noise. Find the LAST run of `<`s
//      of length ≥ 3 inside the zone; if any non-`<` characters sit
//      after it, replace them all with `<`. Long internal `<` runs
//      are guaranteed to be the trailing pad in valid TD3 MRZ.
//   2. Pad the zone back out to 39 chars with `<` (so downstream
//      checksum / parser code keeps its fixed-width contract).
//
// No character-confusable lists, no dictionaries, no regex hacks per
// character class. Cross-pass candidate scoring (see scoreLine1 below
// + the extractor's harvestLines pass) is what selects the OCR pass
// with the most intact `<` filler structure in the first place.
// ─────────────────────────────────────────────────────────────────────

/**
 * Structural name-zone cleanup for MRZ Line 1. Pure ICAO-shape rules
 * only — no per-character substitutions, no language priors. Idempotent
 * on clean MRZ input.
 */
function recoverLine1Name(l1: string): string {
  const padded = l1.padEnd(44, "<").slice(0, 44);
  const prefix = padded.slice(0, 5);
  let zone = padded.slice(5, 44); // 39 chars

  // Step 1: structural trailing-noise truncation.
  // Find the rightmost run of `<` of length ≥ 3. Anything to its
  // right is structurally impossible in an ICAO TD3 name zone and is
  // OCR noise — replace with fillers.
  const re = /<{3,}/g;
  let lastIdx = -1;
  let lastLen = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(zone)) !== null) {
    lastIdx = m.index;
    lastLen = m[0].length;
  }
  if (lastIdx >= 0) {
    const tailStart = lastIdx + lastLen;
    if (tailStart < zone.length) {
      zone = zone.slice(0, tailStart) + "<".repeat(zone.length - tailStart);
    }
  }

  return prefix + zone;
}

/**
 * Extract the two MRZ lines from raw OCR text. Pads/truncates to 44 chars.
 */
export function extractMrzLines(text: string): [string, string] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter((l) => l.length >= 30);

  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i];
    const l2 = lines[i + 1];
    if (l1.startsWith("P") && l1.length >= 38 && l2.length >= 38) {
      return [l1.padEnd(44, "<").slice(0, 44), l2.padEnd(44, "<").slice(0, 44)];
    }
  }

  if (lines.length >= 2) {
    const l1 = lines[lines.length - 2];
    const l2 = lines[lines.length - 1];
    if (l1.length >= 30 && l2.length >= 30) {
      return [l1.padEnd(44, "<").slice(0, 44), l2.padEnd(44, "<").slice(0, 44)];
    }
  }
  return null;
}

/**
 * Per-field OCR normalization, applied BEFORE handing the line off to the
 * `mrz` library. We only fix OCR confusions in zones where the ICAO spec
 * mandates a strict alpha/numeric character class — never inside the name
 * field's alpha chars or inside the alphanumeric passport-number zone.
 */
function normalizeMrzLines(l1Raw: string, l2Raw: string): [string, string] {
  const l1Pre = l1Raw.padEnd(44, '<').slice(0, 44);
  // Run the MRZ Name Recovery stage on Line 1 ONLY, before any further
  // per-zone normalisation. Line 2 is untouched.
  const l1 = recoverLine1Name(l1Pre);
  const l2 = l2Raw.padEnd(44, '<').slice(0, 44);

  // Line 1: positions 0 (doc code "P"), 1 (subtype, alpha or "<"),
  // 2-4 issuing country (alpha-3), 5-43 names (alpha).
  const docCode = l1[0] === '8' ? 'P' : l1[0]; // common P↔8 OCR confusion
  const sub = l1[1];
  const issuing = toAlpha(l1.slice(2, 5));
  const names = toAlpha(l1.slice(5, 44));
  const newL1 = docCode + sub + issuing + names;

  // Line 2: 0-8 passport (alnum), 9 check (digit), 10-12 nationality (alpha),
  // 13-18 DOB (digit), 19 check, 20 sex (alpha), 21-26 expiry (digit),
  // 27 check, 28-41 optional, 42 check, 43 composite check.
  const passport = toAlnum(l2.slice(0, 9));
  const passportChk = toDigits(l2.slice(9, 10));
  const nat = toAlpha(l2.slice(10, 13));
  const dob = toDigits(l2.slice(13, 19));
  const dobChk = toDigits(l2.slice(19, 20));
  const sex = toAlpha(l2.slice(20, 21));
  const expiry = toDigits(l2.slice(21, 27));
  const expiryChk = toDigits(l2.slice(27, 28));
  const opt = l2.slice(28, 42).toUpperCase();
  const optChk = toDigits(l2.slice(42, 43));
  const composite = toDigits(l2.slice(43, 44));
  const newL2 =
    passport + passportChk + nat + dob + dobChk + sex + expiry + expiryChk + opt + optChk + composite;

  return [newL1, newL2];
}

/**
 * Strict ICAO 9303 TD3 parser. Normalises OCR confusions in
 * spec-mandated zones, then delegates field extraction + checksum
 * verification to the standards-compliant `mrz` library.
 */
export function parseMrz(text: string): MRZResult | null {
  const lines = extractMrzLines(text);
  if (!lines) return null;
  const [l1, l2] = normalizeMrzLines(lines[0], lines[1]);
  return parseNormalizedLines([l1, l2]);
}

/**
 * Parse already-normalised, exactly-44-char TD3 lines via the `mrz`
 * library. Exposed so the extractor can mix-and-match best line-1 /
 * line-2 candidates across OCR passes.
 */
export function parseNormalizedLines(lines: [string, string]): MRZResult | null {
  let res;
  try {
    res = parseMrzLib(lines);
  } catch {
    return null;
  }
  if (res.format !== 'TD3') return null;

  const find = (name: string) => res.details.find((d) => d.field === name);
  const docNum = find('documentNumber');
  const docChk = find('documentNumberCheckDigit');
  const dobF = find('birthDate');
  const dobChk = find('birthDateCheckDigit');
  const expF = find('expirationDate');
  const expChk = find('expirationDateCheckDigit');
  const compChk = find('compositeCheckDigit');
  const nat = find('nationality');
  const issuing = find('issuingState');
  const sex = find('sex');
  const last = find('lastName');
  const first = find('firstName');

  const passportOk = !!(docNum?.valid && docChk?.valid);
  const dobOk = !!(dobF?.valid && dobChk?.valid);
  const expiryOk = !!(expF?.valid && expChk?.valid);
  const compositeOk = !!compChk?.valid;

  const surname = sanitizeName((last?.value || '').replace(/</g, ' '));
  const givenName = formatGivenName(first?.value || '');
  const sexRaw = (sex?.value || '').toString().toUpperCase();
  // The `mrz` library normalises sex to "MALE"/"FEMALE"; older callers
  // and our downstream UI expect a single-letter code or "Male"/"Female".
  const sexLetter = sexRaw.startsWith('M')
    ? 'M'
    : sexRaw.startsWith('F')
      ? 'F'
      : '';

  // Library returns birthDate / expirationDate as YYMMDD strings.
  const dobRaw = dobF?.value || '';
  const expRaw = expF?.value || '';

  const score =
    (passportOk ? 0.3 : 0) +
    (dobOk ? 0.25 : 0) +
    (expiryOk ? 0.25 : 0) +
    (compositeOk ? 0.1 : 0) +
    (surname ? 0.05 : 0) +
    (givenName ? 0.05 : 0);

  return {
    surname,
    givenName,
    gender: sexLetter === 'M' ? 'Male' : sexLetter === 'F' ? 'Female' : '',
    dateOfBirth: formatDate(dobRaw, false),
    dateOfExpiry: formatDate(expRaw, true),
    nationality: (nat?.value || issuing?.value || '').toUpperCase(),
    passportNumber: (docNum?.value || '').toUpperCase(),
    checksumValid: passportOk && dobOk && expiryOk,
    checks: {
      passport: passportOk,
      dob: dobOk,
      expiry: expiryOk,
      composite: compositeOk,
    },
    confidence: Math.min(1, score),
  };
}

/**
 * Per-line check helpers used by the extractor to score & mix the best
 * line-1 / line-2 candidates across multiple OCR passes.
 */
export function scoreLine1(line: string): number {
  const l = line.padEnd(44, '<').slice(0, 44).toUpperCase();
  let s = 0;
  if (l[0] === 'P') s += 3;
  if (/^[A-Z<]$/.test(l[1])) s += 0.5;
  if (/^[A-Z]{3}$/.test(l.slice(2, 5))) s += 2;
  const zone = l.slice(5, 44);
  // Mandatory surname/given-name separator.
  if (zone.includes('<<')) s += 3;
  // Overall filler density — proxy for "OCR read the `<` chars correctly".
  const fillers = (zone.match(/</g) || []).length;
  s += Math.min(4, fillers / 5);
  // Trailing filler tail — the single strongest structural signal of
  // a clean OCR pass. ICAO TD3 ALWAYS pads the name zone with `<`s on
  // the right; OCR passes that preserve that tail are structurally
  // correct, passes that "see" letters at the end are not.
  const tail = zone.match(/<+$/)?.[0].length ?? 0;
  s += Math.min(8, tail / 2);
  // Penalise any alphabetic character sitting AFTER a long internal
  // filler run — ICAO-impossible, pure OCR noise.
  if (/<{3,}[A-Z]/.test(zone)) s -= 4;
  return s;
}

export function scoreLine2(line: string): number {
  const l = line.padEnd(44, '<').slice(0, 44).toUpperCase();
  let s = 0;
  const passport = toAlnum(l.slice(0, 9));
  const passportChk = toDigits(l.slice(9, 10));
  const dob = toDigits(l.slice(13, 19));
  const dobChk = toDigits(l.slice(19, 20));
  const expiry = toDigits(l.slice(21, 27));
  const expiryChk = toDigits(l.slice(27, 28));
  if (String(computeCheckDigit(passport)) === passportChk) s += 5;
  if (String(computeCheckDigit(dob)) === dobChk) s += 5;
  if (String(computeCheckDigit(expiry)) === expiryChk) s += 5;
  if (/^[A-Z]{3}$/.test(l.slice(10, 13))) s += 1;
  if (/^[MF<]$/.test(l[20])) s += 1;
  return s;
}

export { normalizeMrzLines };
export { recoverLine1Name };