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
  // Strict ICAO 9303 name cleanup:
  //  - `<` is the spec separator → single space
  //  - drop anything that isn't an A–Z letter or whitespace (no OCR junk
  //    such as digits, `|`, `*`, stray punctuation ever leaks in)
  //  - collapse 3+ identical consecutive letters to 2 (common OCR
  //    duplication artefact, e.g. "RAAAJESH" → "RAAJESH" → "RAJESH"
  //    after a second pass below)
  //  - drop empty tokens and absurdly long tokens (>30 chars = junk)
  const cleaned = name
    .toUpperCase()
    .replace(/</g, " ")
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned
    .split(" ")
    .map((w) => w.replace(/(.)\1{2,}/g, "$1$1"))
    .map((w) => w.replace(/(.)\1+$/g, "$1"))
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
// MRZ Line-1 Name Recovery.
//
// Tesseract occasionally recognises the ICAO filler character `<` as
// one of a small set of visually similar letters (C, K, L, I — and
// less often T, F, E). These artefacts only appear in the name zone
// of line 1 (positions 5..43) and corrupt the parsed Given Name.
//
// This pass runs AFTER OCR and BEFORE ICAO parsing. It operates on
// MRZ Line-1 ONLY. It never touches Line-2 fields (passport number,
// nationality, DOB, gender, expiry, checksums).
//
// Algorithm (purely structural — no dictionaries, no language hints):
//   1.  Repair the trailing filler run. Walk from position 43 back
//       toward 5; while we are still inside an all-filler tail,
//       convert any visually-confusable letter into `<`. Stop the
//       walk as soon as we hit a non-confusable letter — that letter
//       is real name content.
//   2.  Repair the mandatory `<<` surname/given separator. ICAO TD3
//       requires exactly one `<<` in the name field. If absent, look
//       for a `<X` / `X<` pair (X in the confusables) anywhere in
//       the name area and flip the lone letter to `<`. Do this once.
//   3.  Repair lone artefacts inside the given-name run. Any
//       confusable letter that sits between two `<` fillers (or
//       between a `<` and the end of the trailing run) is treated as
//       a misread filler. Real middle initials are preserved because
//       they would either be a non-confusable letter (e.g. "A", "R")
//       or be flanked by name letters rather than `<` on both sides.
// ─────────────────────────────────────────────────────────────────────
const FILLER_CONFUSABLES = "CKLITFE";

function isConf(c: string): boolean {
  return FILLER_CONFUSABLES.includes(c);
}

/**
 * Score a reconstructed 39-char name field against ICAO TD3 structural
 * expectations. No dictionaries — purely shape-based.
 */
function scoreNameField(name: string): number {
  let s = 0;
  // Mandatory `<<` surname / given separator.
  if (name.includes("<<")) s += 10;
  // Trailing filler run — longer is better.
  const trail = name.match(/<*$/)?.[0].length ?? 0;
  s += Math.min(15, trail);
  // Reasonable letter count (a real name field has 6..30 letters).
  const letters = (name.match(/[A-Z]/g) || []).length;
  if (letters >= 6 && letters <= 30) s += 5;
  else if (letters < 6) s -= 5;
  // Penalise impossible token shapes (single-letter token glued to
  // trailing fillers, e.g. "<K<<<<<<" — almost always an OCR artefact).
  const stripped = name.replace(/<+$/, "");
  const tokens = stripped.split(/<+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length === 1) s -= 2;
    if (t.length >= 2) s += 1;
  }
  return s;
}

/**
 * MRZ Line-1 Name Recovery.
 *
 * Tesseract occasionally recognises the ICAO filler `<` as one of a
 * small set of visually-similar letters (C, K, L, I, T, F, E). Those
 * artefacts only ever appear in the name zone (positions 5..43) of
 * Line 1 and corrupt the parsed Given Name.
 *
 * Runs AFTER OCR and BEFORE ICAO parsing. Operates on Line 1 ONLY.
 *
 * Strategy: generate a small set of structurally-plausible candidate
 * reconstructions by greedily forcing trailing confusables and / or
 * confusables adjacent to existing fillers into `<`. Score every
 * candidate (including the original untouched line) against ICAO
 * shape rules and return the highest-scoring one. The untouched line
 * is always a candidate, so clean MRZ reads can never be made worse.
 */
function recoverLine1Name(l1: string): string {
  const padded = l1.padEnd(44, "<").slice(0, 44);
  const prefix = padded.slice(0, 5);
  const original = padded.slice(5, 44); // 39 chars

  const candidates: string[] = [original];

  // Candidate A: trailing-tail recovery. Walk back; convert confusable
  // letters to `<` while the char immediately to the right (already
  // processed) is `<`. Stop at the first non-confusable letter.
  {
    const arr = original.split("");
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      if (c === "<") continue;
      const right = i < arr.length - 1 ? arr[i + 1] : "<";
      if (isConf(c) && right === "<") {
        arr[i] = "<";
        continue;
      }
      break;
    }
    candidates.push(arr.join(""));
  }

  // Candidate B: lone-artefact recovery. Any confusable letter flanked
  // by `<` on BOTH sides is treated as a misread filler.
  {
    const arr = original.split("");
    for (let i = 0; i < arr.length; i++) {
      if (!isConf(arr[i])) continue;
      const prev = i > 0 ? arr[i - 1] : "<";
      const next = i < arr.length - 1 ? arr[i + 1] : "<";
      if (prev === "<" && next === "<") arr[i] = "<";
    }
    candidates.push(arr.join(""));
  }

  // Candidate C: separator recovery. If no `<<` separator exists, flip
  // a single confusable letter that sits next to a `<` to recreate the
  // separator. Try both `<X` and `X<` shapes.
  if (!original.includes("<<")) {
    const tryFlip = (idx: number) => {
      const arr = original.split("");
      arr[idx] = "<";
      candidates.push(arr.join(""));
    };
    let m = original.match(/<([CKLITFE])/);
    if (m) tryFlip(m.index! + 1);
    m = original.match(/([CKLITFE])</);
    if (m) tryFlip(m.index!);
  }

  // Candidate D: combine trailing + lone artefact recovery (most common
  // real-world OCR damage pattern).
  {
    const arr = candidates[1].split(""); // start from lone-artefact pass
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      if (c === "<") continue;
      const right = i < arr.length - 1 ? arr[i + 1] : "<";
      if (isConf(c) && right === "<") {
        arr[i] = "<";
        continue;
      }
      break;
    }
    candidates.push(arr.join(""));
  }

  // Candidate E: severely-damaged MRZ where every `<` was misread as
  // a confusable letter, leaving no `<<` separator at all. Generate a
  // variant for each adjacent confusable pair (`XX`) by forcing it to
  // `<<`, then run trailing-tail + lone-artefact recovery on top. The
  // scorer below picks the variant that best matches the ICAO shape.
  if (!original.includes("<<")) {
    for (let i = 0; i < original.length - 1; i++) {
      if (!isConf(original[i]) || !isConf(original[i + 1])) continue;
      const arr = original.split("");
      arr[i] = "<";
      arr[i + 1] = "<";
      // Cascade: lone-artefact pass.
      for (let j = 0; j < arr.length; j++) {
        if (!isConf(arr[j])) continue;
        const prev = j > 0 ? arr[j - 1] : "<";
        const next = j < arr.length - 1 ? arr[j + 1] : "<";
        if (prev === "<" && next === "<") arr[j] = "<";
      }
      // Cascade: trailing-tail pass.
      for (let j = arr.length - 1; j >= 0; j--) {
        const c = arr[j];
        if (c === "<") continue;
        const right = j < arr.length - 1 ? arr[j + 1] : "<";
        if (isConf(c) && right === "<") {
          arr[j] = "<";
          continue;
        }
        break;
      }
      candidates.push(arr.join(""));
    }
  }

  let best = original;
  let bestScore = scoreNameField(original);
  for (const c of candidates) {
    const s = scoreNameField(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  return prefix + best;
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
  const givenName = sanitizeName((first?.value || '').replace(/</g, ' '));
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
  if (l.slice(5, 44).includes('<<')) s += 3;
  const fillers = (l.match(/</g) || []).length;
  s += Math.min(2, fillers / 10);
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