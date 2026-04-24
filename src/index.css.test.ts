import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('nodu CSS helpers', () => {
  it('defines the Task 1 tokens and helper classes in src/index.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    [
      '--nodu-paper',
      '--nodu-accent',
      '.nodu-app-shell',
      '.nodu-page-frame',
      '.nodu-surface',
      '.nodu-panel',
    ].forEach((token) => {
      expect(css).toContain(token);
    });
  });
});
