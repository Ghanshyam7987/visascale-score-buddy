// ICAO 9303 TD3 (passport) MRZ parser with strict fixed-position parsing,
// per-field OCR normalization, and full checksum validation (including
// composite). Designed to be the single source of truth for MRZ data —
// no heuristics, no AI guessing.

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
  return name
    .replace(/[LK<]{3,}.*$/gi, "")
    .replace(/[KL<]{2,}$/i, "")
    .replace(/[<]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[KL]\s+/i, "")
    .trim();
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
 * Strict ICAO 9303 TD3 parser. Uses FIXED positions, applies per-field
 * OCR normalization, splits the name on `<<` only.
 */
export function parseMrz(text: string): MRZResult | null {
  const lines = extractMrzLines(text);
  if (!lines) return null;
  const [l1, l2] = lines;

  // ─── Line 1 (positions are ICAO-fixed) ──────────────────────────────
  // 0      : doc type ("P")
  // 1      : doc subtype / "<"
  // 2-4    : issuing country (alpha-3)
  // 5-43   : name field = SURNAME<<GIVEN<NAMES, filler "<"
  const issuingCountry = toAlpha(l1.slice(2, 5)).replace(/</g, "");
  const nameField = l1.slice(5, 44);
  // Names are alpha-only — fix digit→letter confusions inside the name field.
  const nameAlpha = toAlpha(nameField);
  // Split STRICTLY on `<<`. The first chunk is the surname, the rest is given names.
  const nameParts = nameAlpha.split("<<");
  const surname = sanitizeName((nameParts[0] || "").replace(/</g, " "));
  const givenName = sanitizeName(
    nameParts.slice(1).join(" ").replace(/</g, " "),
  );

  // ─── Line 2 (fixed positions) ───────────────────────────────────────
  // 0-8   : passport number
  // 9     : passport-number check digit
  // 10-12 : nationality (alpha-3)
  // 13-18 : DOB (YYMMDD)
  // 19    : DOB check digit
  // 20    : sex
  // 21-26 : expiry (YYMMDD)
  // 27    : expiry check digit
  // 28-41 : personal number
  // 42    : personal number check
  // 43    : composite check
  const passportNumber = toAlnum(l2.slice(0, 9)).replace(/</g, "");
  const passportCheckChar = toDigits(l2.slice(9, 10));
  const nationality = toAlpha(l2.slice(10, 13)).replace(/</g, "");
  const dobRaw = toDigits(l2.slice(13, 19));
  const dobCheckChar = toDigits(l2.slice(19, 20));
  const sexRaw = toAlpha(l2.slice(20, 21));
  const expiryRaw = toDigits(l2.slice(21, 27));
  const expiryCheckChar = toDigits(l2.slice(27, 28));
  const personalRaw = l2.slice(28, 42);
  const personalCheckChar = toDigits(l2.slice(42, 43));
  const compositeCheckChar = toDigits(l2.slice(43, 44));

  // Per-field checksums.
  const passportOk =
    String(computeCheckDigit(toAlnum(l2.slice(0, 9)))) === passportCheckChar;
  const dobOk = String(computeCheckDigit(dobRaw)) === dobCheckChar;
  const expiryOk = String(computeCheckDigit(expiryRaw)) === expiryCheckChar;

  // Composite check covers: passport(0-9) + dob(13-20) + expiry(21-28) + personal(28-43).
  const compositeInput =
    toAlnum(l2.slice(0, 10)) +
    toDigits(l2.slice(13, 20)) +
    toDigits(l2.slice(21, 28)) +
    personalRaw +
    personalCheckChar;
  const compositeOk =
    String(computeCheckDigit(compositeInput)) === compositeCheckChar;

  const checksumValid = passportOk && dobOk && expiryOk;

  // Confidence: weighted checksum pass-rate.
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
    gender: sexRaw === "M" ? "Male" : sexRaw === "F" ? "Female" : "",
    dateOfBirth: formatDate(dobRaw, false),
    dateOfExpiry: formatDate(expiryRaw, true),
    nationality: nationality || issuingCountry,
    passportNumber,
    checksumValid,
    checks: {
      passport: passportOk,
      dob: dobOk,
      expiry: expiryOk,
      composite: compositeOk,
    },
    confidence: Math.min(1, score),
  };
}