import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

function parseLine(text: string): Line | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner = null, error } = value as Record<string, unknown>;
  if (typeof at !== 'string') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status: status as RunStatus, owner, error };
}

// Chronological when both stamps parse (offsets differ across a night); raw string order otherwise.
function compareAt(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  return a < b ? -1 : a > b ? 1 : 0;
}

type Acc = { row: DigestRow; errorAt: string | null };

export function readNight(runsDir: string, night: string): NightDigest | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const jobs = new Map<string, Acc>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;

    let acc = jobs.get(line.job);
    if (!acc) {
      acc = {
        row: {
          job: line.job,
          owner: line.owner,
          runs: 0,
          retries: 0,
          lastStatus: line.status,
          lastError: null,
          firstAt: line.at,
          lastAt: line.at,
        },
        errorAt: null,
      };
      jobs.set(line.job, acc);
    }
    const { row } = acc;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (compareAt(line.at, row.firstAt) < 0) row.firstAt = line.at;
    // Ties go to the later line in the file.
    if (compareAt(line.at, row.lastAt) >= 0) {
      row.lastAt = line.at;
      row.lastStatus = line.status;
      row.owner = line.owner;
    }
    if (line.error !== undefined && (acc.errorAt === null || compareAt(line.at, acc.errorAt) >= 0)) {
      acc.errorAt = line.at;
      row.lastError = line.error;
    }
  }

  const rows = [...jobs.values()].map((a) => a.row).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines, counts };
}
