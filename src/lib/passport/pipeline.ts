import { Applicant, ExtractedFields, PassportExtractor, ProcessingStage } from './types';
import { WorkerPoolExtractor } from './workerPoolExtractor';

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
 * Parallel orchestrator. When the extractor is a WorkerPoolExtractor we
 * dispatch up to `pool.size` items concurrently; otherwise we fall back
 * to sequential to preserve the contract.
 *
 * ETA is computed from actual completion velocity (items/sec), so the
 * estimate naturally accelerates as parallel workers finish.
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
  let inFlight = 0;
  let lastStage: ProcessingStage = 'preparing';

  const concurrency =
    extractor instanceof WorkerPoolExtractor ? extractor.size : 1;

  const emit = (stage: ProcessingStage) => {
    lastStage = stage;
    const elapsed = (performance.now() - start) / 1000;
    const done = completed + inFlight * 0.5;
    const perItem = done > 0 ? elapsed / done : 0;
    const remaining = Math.max(total - completed, 0);
    const eta = perItem > 0 ? Math.round((perItem * remaining) / Math.max(concurrency, 1)) : null;
    cb.onProgress?.({
      index: Math.min(completed + 1, total),
      total,
      stage,
      etaSeconds: eta,
    });
  };

  let cursor = 0;
  const runOne = async (): Promise<void> => {
    while (cursor < total && !signal?.aborted) {
      const idx = cursor++;
      const item = items[idx];
      const url = URL.createObjectURL(item.file);
      inFlight += 1;
      try {
        const fields = await extractor.extract(url, {
          onStage: emit,
          signal,
        });
        cb.onItem?.(item.id, fields);
      } catch (err) {
        cb.onItem?.(item.id, null, err as Error);
      } finally {
        URL.revokeObjectURL(url);
        inFlight -= 1;
        completed += 1;
        emit(lastStage);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => runOne()),
  );
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