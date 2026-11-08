// Shared digest contract. Section 2 starts against this file; the reader fills readNight in.

export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** Null when the log owner is null. The page shows that as —. */
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Error from the latest line that carried one. Null when the job never had one. */
  lastError: string | null;
  /** Log timestamps, offset kept, never converted. */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  /** Sorted by job, so the page and the JSON share one order. */
  rows: DigestRow[];
  badLines: number;
  /** Parsed lines by status. The board shows these beside each night. */
  counts: { ok: number; retry: number; fail: number };
};

/** Missing file returns null. An empty file returns no rows and zero bad lines. */
export function readNight(runsDir: string, night: string): NightDigest | null {
  throw new Error(`readNight(${runsDir}, ${night}) is not implemented`);
}
