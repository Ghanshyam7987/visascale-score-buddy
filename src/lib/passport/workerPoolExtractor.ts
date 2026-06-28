import { TesseractExtractor } from './tesseractExtractor';
import { ExtractOptions, ExtractedFields, PassportExtractor } from './types';

/**
 * WorkerPoolExtractor — round-robin pool of TesseractExtractor instances.
 * Each TesseractExtractor wraps a tesseract.js Worker (web worker under
 * the hood), so N parallel extractors == N concurrent OCR pipelines
 * without blocking the UI thread.
 *
 * The pool implements the same PassportExtractor contract as the single
 * extractor, so the calling pipeline can swap them transparently.
 */
export class WorkerPoolExtractor implements PassportExtractor {
  private workers: TesseractExtractor[] = [];
  private queue: Array<() => void> = [];
  private busy: Set<TesseractExtractor> = new Set();
  readonly size: number;

  constructor(size?: number) {
    const hw =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? Math.floor(navigator.hardwareConcurrency / 2)
        : 2;
    this.size = Math.max(2, Math.min(4, size ?? hw));
  }

  async init(): Promise<void> {
    if (this.workers.length) return;
    this.workers = Array.from({ length: this.size }, () => new TesseractExtractor());
    await Promise.all(this.workers.map((w) => w.init()));
  }

  async dispose(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.dispose()));
    this.workers = [];
    this.busy.clear();
    this.queue = [];
  }

  private async acquire(): Promise<TesseractExtractor> {
    const free = this.workers.find((w) => !this.busy.has(w));
    if (free) {
      this.busy.add(free);
      return free;
    }
    return new Promise<TesseractExtractor>((resolve) => {
      this.queue.push(() => {
        const next = this.workers.find((w) => !this.busy.has(w))!;
        this.busy.add(next);
        resolve(next);
      });
    });
  }

  private release(w: TesseractExtractor) {
    this.busy.delete(w);
    const next = this.queue.shift();
    if (next) next();
  }

  async extract(source: Blob | string, opts: ExtractOptions = {}): Promise<ExtractedFields> {
    if (!this.workers.length) await this.init();
    const w = await this.acquire();
    try {
      return await w.extract(source, opts);
    } finally {
      this.release(w);
    }
  }
}