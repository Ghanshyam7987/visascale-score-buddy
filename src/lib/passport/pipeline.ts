import { Applicant, ExtractedFields, PassportExtractor, ProcessingStage } from './types';

export interface PipelineProgress {
  index: number;        // 1-based current item
  total: number;
  stage: ProcessingStage;
  etaSeconds: number | null;
}

export interface PipelineCallbacks {
  onProgress?: (p: PipelineProgress) => void;
  onItem?: (id: string, fields: ExtractedFields | null, error?: Error) => void;
}

export interface PipelineItem {
  id: string;
  file: File;
}

/**
 * Sequential orchestrator with ETA computation. Architected so a parallel
 * worker-pool variant (next phase) can share the same callbacks contract.
 */
export async function runPipeline(
  items: PipelineItem[],
  extractor: PassportExtractor,
  cb: PipelineCallbacks = {},
  signal?: AbortSignal,
): Promise<void> {
  const total = items.length;
  const start = performance.now();
  let completed = 0;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) return;
    const item = items[i];
    const url = URL.createObjectURL(item.file);

    const emit = (stage: ProcessingStage) => {
      const elapsed = (performance.now() - start) / 1000;
      const done = completed + (stage === 'finished' ? 1 : 0.5);
      const perItem = done > 0 ? elapsed / done : 0;
      const remaining = Math.max(total - completed, 0);
      const eta = perItem > 0 ? Math.round(perItem * remaining) : null;
      cb.onProgress?.({ index: i + 1, total, stage, etaSeconds: eta });
    };

    try {
      const fields = await extractor.extract(url, { onStage: emit, signal });
      cb.onItem?.(item.id, fields);
    } catch (err) {
      cb.onItem?.(item.id, null, err as Error);
    } finally {
      URL.revokeObjectURL(url);
      completed += 1;
    }
  }
}

export function emptyApplicant(id: string, imageUrl: string): Applicant {
  return {
    id,
    imageUrl,
    status: 'failed',
    surname: '',
    givenName: '',
    gender: '',
    dateOfBirth: '',
    placeOfBirth: '',
    dateOfIssue: '',
    placeOfIssue: '',
    dateOfExpiry: '',
    nationality: '',
    passportNumber: '',
  };
}