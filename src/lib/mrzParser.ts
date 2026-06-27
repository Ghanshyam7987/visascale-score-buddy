// MRZ TD3 (passport) parser with checksum validation.
// Standard: 2 lines of 44 chars each.

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

function cleanLine(line: string): string {
  return line.replace(/\s+/g, "").replace(/[^A-Z0-9<]/gi, "").toUpperCase();
}

/**
 * Try to extract the two MRZ lines from raw OCR text.
 */
export function extractMrzLines(text: string): [string, string] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter((l) => l.length >= 30);

  // Look for the passport line starting with P
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i];
    const l2 = lines[i + 1];
    if (l1.startsWith("P") && l1.length >= 38 && l2.length >= 38) {
      return [l1.padEnd(44, "<").slice(0, 44), l2.padEnd(44, "<").slice(0, 44)];
    }
  }

  // Fallback: last two longest lines
  if (lines.length >= 2) {
    const l1 = lines[lines.length - 2];
    const l2 = lines[lines.length - 1];
    if (l1.length >= 30 && l2.length >= 30) {
      return [l1.padEnd(44, "<").slice(0, 44), l2.padEnd(44, "<").slice(0, 44)];
    }
  }
  return null;
}

export function parseMrz(text: string): MRZResult | null {
  const lines = extractMrzLines(text);
  if (!lines) return null;
  const [line1, line2] = lines;

  // Line 1: P<ISSUER<SURNAME<<GIVEN<NAMES
  const nationality = line1.slice(2, 5).replace(/</g, "");
  const namePart = line1.slice(5);
  const [surnameRaw, givenRaw = ""] = namePart.split("<<");
  const surname = surnameRaw.replace(/</g, " ").trim();
  const givenName = givenRaw.replace(/</g, " ").trim();

  // Line 2 positions
  const passportNumber = line2.slice(0, 9).replace(/</g, "");
  const passportCheck = line2.slice(9, 10);
  // nationality 10-13
  const dob = line2.slice(13, 19);
  const dobCheck = line2.slice(19, 20);
  const gender = line2.slice(20, 21);
  const expiry = line2.slice(21, 27);
  const expiryCheck = line2.slice(27, 28);
  // personal 28-42, composite check 43

  // Checksum validation
  const c1 = String(computeCheckDigit(line2.slice(0, 9))) === passportCheck;
  const c2 = String(computeCheckDigit(dob)) === dobCheck;
  const c3 = String(computeCheckDigit(expiry)) === expiryCheck;
  const checksumValid = c1 && c2 && c3;

  return {
    surname,
    givenName,
    gender: gender === "M" ? "Male" : gender === "F" ? "Female" : "",
    dateOfBirth: formatDate(dob, false),
    dateOfExpiry: formatDate(expiry, true),
    nationality,
    passportNumber,
    checksumValid,
  };
}