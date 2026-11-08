import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function configWith(files: Record<string, string>): Promise<RigConfig> {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
  dirs.push(runsDir);
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(runsDir, name), text);
  }
  return {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
}

function logLine(job: string, status: 'ok' | 'retry' | 'fail', at: string): string {
  return JSON.stringify({ at, job, status, owner: 'rook' });
}

// First occurrence of each job. Missing jobs fail the assertion instead of sorting to the front.
function expectJobsInOrder(html: string, jobs: readonly string[]) {
  let previous = -1;
  for (const job of jobs) {
    const at = html.indexOf(job);
    expect(at).toBeGreaterThan(previous);
    previous = at;
  }
}

describe('digest routes', () => {
  it('returns 200 for a night with valid lines, page and JSON in the same order', async () => {
    const night = '2026-11-02';
    const config = await configWith({
      [`${night}.jsonl`]: [
        logLine('zebra', 'ok', '2026-11-02T01:00:00+01:00'),
        logLine('alpha', 'ok', '2026-11-02T02:00:00+01:00'),
        logLine('alpha', 'retry', '2026-11-02T03:00:00+01:00'),
        logLine('mid', 'fail', '2026-11-02T04:00:00+01:00'),
      ].join('\n'),
    });
    const app = createApp(config);
    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);

    const jobs = ['alpha', 'mid', 'zebra'];
    const body = (await api.json()) as NightDigest;
    expect(body.rows.map((row) => row.job)).toEqual(jobs);
    expectJobsInOrder(await page.text(), jobs);
  });

  it('returns 404 for a night with no file', async () => {
    const config = await configWith({
      '2026-11-01.jsonl': logLine('other', 'ok', '2026-11-01T01:00:00+01:00'),
    });
    const app = createApp(config);

    expect((await app.request('/digest/2026-11-03')).status).toBe(404);
    expect((await app.request('/api/digest/2026-11-03')).status).toBe(404);
  });

  it('renders an empty file as an empty night', async () => {
    const night = '2026-11-04';
    const config = await configWith({ [`${night}.jsonl`]: '' });
    const app = createApp(config);
    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const body = (await api.json()) as NightDigest;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('returns 200 and keeps the valid job when a line is bad', async () => {
    const night = '2026-11-05';
    const config = await configWith({
      [`${night}.jsonl`]: ['{not json', logLine('kept-job', 'ok', '2026-11-05T01:00:00+01:00')].join('\n'),
    });
    const app = createApp(config);
    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await page.text()).toContain('kept-job');

    const body = (await api.json()) as NightDigest;
    expect(body.rows.map((row) => row.job)).toContain('kept-job');
  });
});
