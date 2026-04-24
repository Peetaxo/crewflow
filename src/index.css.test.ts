import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('nodu CSS helpers', () => {
  it('defines token-driven nodu surface helpers for shared light and dark mode styling', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const darkTokenBlock = css.match(/\.dark\s*\{[\s\S]*?--nodu-accent-rgb:\s*224 138 74;[\s\S]*?\}/)?.[0];
    const sidebarShellRule = css.match(/\.nodu-sidebar-shell\s*\{[\s\S]*?\}/)?.[0];
    const sidebarSurfaceRule = css.match(/\.nodu-sidebar-surface\s*\{[\s\S]*?\}/)?.[0];
    const sidebarSearchRule = css.match(/\.nodu-sidebar-search\s*\{[\s\S]*?\}/)?.[0];
    const darkSidebarShellRule = css.match(/\.dark \.nodu-sidebar-shell\s*\{[\s\S]*?\}/)?.[0];
    const darkSidebarSearchRule = css.match(/\.dark \.nodu-sidebar-search::placeholder\s*\{[\s\S]*?\}/)?.[0];
    const darkJobBadgeRule = css.match(/\.dark \.jn\.nodu-job-badge,\s*\.dark \.nodu-event-meta-badge\s*\{[\s\S]*?\}/)?.[0];
    const statCardRule = css.match(/\.nodu-stat-card\s*\{[\s\S]*?\}/)?.[0];
    const darkStatCardRule = css.match(/\.dark \.nodu-stat-card\s*\{[\s\S]*?\}/)?.[0];
    const dashboardActionRule = css.match(/\.nodu-dashboard-action\s*\{[\s\S]*?\}/)?.[0];

    [
      '--nodu-paper',
      '--nodu-accent',
      '.nodu-app-shell',
      '.nodu-page-frame',
      '.nodu-surface',
      '.nodu-panel',
      '.nodu-sidebar-shell',
      '.nodu-stat-card',
      '.nodu-dashboard-action',
      '.dark .nodu-sidebar-shell',
      '.dark .nodu-stat-card',
    ].forEach((token) => {
      expect(css).toContain(token);
    });

    expect(darkTokenBlock).toContain('--nodu-surface-rgb: 35 27 22;');
    expect(darkTokenBlock).toContain('--nodu-text-rgb: 245 234 223;');
    expect(sidebarShellRule).toContain('var(--nodu-surface-rgb)');
    expect(sidebarShellRule).toContain('var(--nodu-surface-muted-rgb)');
    expect(sidebarSurfaceRule).toContain('var(--nodu-surface-rgb)');
    expect(sidebarSearchRule).toContain('var(--nodu-surface-rgb)');
    expect(statCardRule).toContain('var(--nodu-surface-rgb)');
    expect(dashboardActionRule).toContain('var(--nodu-surface-rgb)');
    expect(darkSidebarShellRule).toContain('!important');
    expect(darkSidebarSearchRule).toContain('!important');
    expect(darkStatCardRule).toContain('!important');
    expect(darkJobBadgeRule).toContain('var(--nodu-accent-rgb)');
    expect(sidebarShellRule).not.toContain('255, 250, 244');
    expect(sidebarSurfaceRule).not.toContain('255, 255, 255');
  });
});
