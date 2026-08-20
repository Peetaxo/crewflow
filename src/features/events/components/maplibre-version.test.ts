import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MapLibre runtime compatibility', () => {
  it('keeps MapLibre GL JS on the verified mobile preview version', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'node_modules/maplibre-gl/package.json'), 'utf8'),
    ) as { version: string };

    expect(packageJson.version).toBe('5.6.2');
  });
});
