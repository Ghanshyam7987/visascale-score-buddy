/**
 * Controlled-concurrency MRZ extraction queue.
 *
 * Runs a small Tesseract worker pool in parallel (desktop 2, mobile 1)
 * so a 200-image bulk run is bounded by CPU cores, not by a single serialized
 * OCR pipeline. Workers are pre-warmed once and reused across every file.
 */
import type { Worker } from 'tesseract.js';
import { createMrzWorker, extractPassportMrz, type MrzResult } from './mrzExtractor';

export interface QueueJob<T> {
  id: string;
  file: File;
  meta?: T;
}

export interface QueueUpdate<T> {
  id: string;
  meta?: T;
  file: File;
  result?: MrzResult;
  error?: string;
  status: 'processing' | 'done' | 'error';
}

export interface QueueOptions<T> {
  concurrency?: number;
  onUpdate: (u: QueueUpdate<T>) => void;
  onOverall?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
  /** Hard per-file timeout in ms. Default 120s. */
  timeoutMs?: number;
}

function pickConcurrency(hint?: number): number {
  if (hint && hint > 0) return Math.min(4, Math.max(1, Math.floor(hint)));
  const hw = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 4;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  // Tesseract WASM is memory-bound in mobile WebViews. Parallel OCR there can
  // make every job time out; one reused worker is slower than desktop, but far
  // more reliable. Desktop gets two workers for real bulk speedup.
  if (isMobile) return 1;
  return hw >= 6 ? 2 : 1;
}

class QueueTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueTimeoutError';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new QueueTimeoutError(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (e) => { clearTimeout(t); reject(e); });
  });
}

export async function runMrzQueue<T>(
  jobs: QueueJob<T>[],
  opts: QueueOptions<T>,
): Promise<void> {
  if (jobs.length === 0) return;
  const concurrency = pickConcurrency(opts.concurrency);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const workers: Worker[] = [];
  try {
    // Pre-warm all workers in parallel. Failing here is fatal for the run.
    const created = await Promise.all(
      Array.from({ length: concurrency }, () => createMrzWorker()),
    );
    workers.push(...created);

    let cursor = 0;
    let doneCount = 0;
    const total = jobs.length;

    const replaceWorker = async (deadWorker: Worker): Promise<Worker | null> => {
      try { await deadWorker.terminate(); } catch { /* noop */ }
      if (opts.signal?.cancelled) return null;
      try {
        const fresh = await createMrzWorker();
        workers.push(fresh);
        return fresh;
      } catch {
        return null;
      }
    };

    const runOne = async (initialWorker: Worker) => {
      let worker: Worker | null = initialWorker;
      while (true) {
        if (opts.signal?.cancelled) return;
        if (!worker) return;
        const i = cursor++;
        if (i >= total) return;
        const job = jobs[i];
        opts.onUpdate({ id: job.id, file: job.file, meta: job.meta, status: 'processing' });
        try {
          const result = await withTimeout(
            extractPassportMrz(job.file, { worker }),
            timeoutMs,
            `OCR for ${job.file.name}`,
          );
          opts.onUpdate({
            id: job.id, file: job.file, meta: job.meta,
            status: result.ok ? 'done' : 'error',
            result,
            error: result.ok ? undefined : (result.error || 'MRZ not found'),
          });
        } catch (err) {
          opts.onUpdate({
            id: job.id, file: job.file, meta: job.meta,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          if (err instanceof QueueTimeoutError && worker) {
            // A timed-out recognize() keeps running inside Tesseract. Reusing
            // that worker immediately can corrupt the next job, so kill it and
            // continue the queue with a fresh worker.
            worker = await replaceWorker(worker);
          }
        } finally {
          doneCount++;
          opts.onOverall?.(doneCount, total);
        }
      }
    };

    await Promise.all(workers.map((w) => runOne(w)));
  } finally {
    // Always terminate every worker so the WASM heap is released.
    await Promise.allSettled(workers.map((w) => w.terminate()));
  }
}