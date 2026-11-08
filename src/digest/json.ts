import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './types.js';

export function mountDigestJson(app: Hono, config: RigConfig) {
  app.get('/api/digest/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (digest === null) {
      return c.json({ error: 'not found' }, 404);
    }
    return c.json(digest);
  });
}
