// Shared types for the Bulk Passport Extractor pipeline.
// Designed so a future Web-Worker / parallel-pool implementation
// can drop in without touching the UI.

export type ApplicantStatus = 'verified' | 'review' | 'failed';

export interface Applicant {
  id: string;
  status: ApplicantStatus;
  surname: string;
  givenName: string;
  gender: string;
  dateOfBirth: string;
  dateOfExpiry: string;
  nationality: string;
  passportNumber: string;
  imageUrl: string;
}

export type ApplicantField = Exclude<keyof Applicant, 'id' | 'imageUrl' | 'status'>;

export type ExtractedFields = Pick<
  Applicant,
  | 'surname'
  | 'givenName'
  | 'gender'
  | 'dateOfBirth'
  | 'dateOfExpiry'
  | 'nationality'
  | 'passportNumber'
> & { status: ApplicantStatus };

/** Granular pipeline stages for UI progress feedback. */
export type ProcessingStage =
  | 'idle'
  | 'preparing'
  | 'detecting_mrz'
  | 'reading_mrz'
  | 'validating'
  | 'ocr_upper'
  | 'finished';

export const STAGE_LABEL: Record<ProcessingStage, string> = {
  idle: 'Idle',
  preparing: 'Preparing Image',
  detecting_mrz: 'Detecting MRZ',
  reading_mrz: 'Reading MRZ',
  validating: 'Validating',
  ocr_upper: 'OCR Upper Section',
  finished: 'Finished',
};

export interface ExtractOptions {
  rotationDeg?: number;
  /** Notified as the pipeline moves through stages. */
  onStage?: (stage: ProcessingStage) => void;
  /** Used to cancel an in-flight extraction (e.g. Clear Session). */
  signal?: AbortSignal;
}

/**
 * Pluggable extractor contract. Implementations:
 *   - TesseractExtractor (current, main-thread)
 *   - WorkerPoolExtractor (next phase, parallel Web Workers)
 */
export interface PassportExtractor {
  init(): Promise<void>;
  extract(source: Blob | string, opts?: ExtractOptions): Promise<ExtractedFields>;
  dispose(): Promise<void>;
}

export const REQUIRED_FIELDS: ApplicantField[] = [
  'surname',
  'givenName',
  'gender',
  'dateOfBirth',
  'dateOfExpiry',
  'nationality',
  'passportNumber',
];

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

export function computeStatus(
  data: Omit<ExtractedFields, 'status'>,
  checksumValid: boolean,
): ApplicantStatus {
  if (!checksumValid) return 'review';
  for (const f of REQUIRED_FIELDS) {
    const v = (data as Record<string, string>)[f];
    if (!v || !String(v).trim()) return 'review';
  }
  if (
    !DATE_RE.test(data.dateOfBirth) ||
    !DATE_RE.test(data.dateOfExpiry)
  ) {
    return 'review';
  }
  return 'verified';
}