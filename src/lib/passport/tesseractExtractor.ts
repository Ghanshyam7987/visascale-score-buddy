import { MrzExtractor } from '@/services/mrzExtractor';
import { ExtractOptions, ExtractedFields, PassportExtractor } from './types';

/**
 * Phase-1 surgical replacement: `TesseractExtractor` is kept as a thin
 * adapter so `WorkerPoolExtractor`, `pipeline.ts`, and the UI continue
 * importing from the exact same path with the exact same contract.
 *
 * All real extraction logic now lives in `src/services/mrzExtractor.ts`
 * (strict MRZ-only, ICAO 9303 TD3, full checksum gating).
 */
export class TesseractExtractor implements PassportExtractor {
  private impl = new MrzExtractor();

  init(): Promise<void> {
    return this.impl.init();
  }

  dispose(): Promise<void> {
    return this.impl.dispose();
  }

  extract(source: Blob | string, opts?: ExtractOptions): Promise<ExtractedFields> {
    return this.impl.extract(source, opts);
  }
}
