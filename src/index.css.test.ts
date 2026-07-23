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
    const darkJobBadgeRule = css.match(/\.dark \.jn\.nodu-job-badge\s*\{[\s\S]*?\}/)?.[0];
    const darkMetaBadgeRule = css.match(/\.dark \.nodu-event-meta-badge\s*\{[\s\S]*?\}/)?.[0];
    const statCardRule = css.match(/\.nodu-stat-card\s*\{[\s\S]*?\}/)?.[0];
    const darkStatCardRule = css.match(/\.dark \.nodu-stat-card\s*\{[\s\S]*?\}/)?.[0];
    const dashboardActionRule = css.match(/\.nodu-dashboard-action\s*\{[\s\S]*?\}/)?.[0];
    const mobileCrewScrollbarRule = css.match(/\.nodu-app-shell--mobile-crew \*[\s\S]*?scrollbar-width:\s*none;[\s\S]*?\}/)?.[0];
    const mobileCrewWebkitScrollbarRule = css.match(/\.nodu-app-shell--mobile-crew \*::-webkit-scrollbar\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogModalRule = css.match(/\.nodu-mobile-timelog-modal\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogHeaderRule = css.match(/\.nodu-mobile-timelog-header\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogFooterRule = css.match(/\.nodu-mobile-timelog-footer\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogPanelRule = css.match(/\.nodu-mobile-timelog-summary,\s*\.nodu-mobile-timelog-day-editor,\s*\.nodu-mobile-timelog-report-editor\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeLabelRule = css.match(/\.nodu-mobile-timelog-time-label\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeConfirmRule = css.match(/\.nodu-mobile-timelog-time-confirm\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeWheelRule = css.match(/\.nodu-mobile-timelog-time-wheel\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeColumnRule = css.match(/\.nodu-mobile-timelog-time-column\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayPickerRule = css.match(/\.nodu-mobile-timelog-add-day-picker\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayPickerGridRule = css.match(/\.nodu-mobile-timelog-add-day-picker-grid\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayCellRule = css.match(/\.nodu-mobile-timelog-add-day-cell\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayConfirmRule = css.match(/\.nodu-mobile-timelog-add-day-confirm\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventDetailRule = css.match(/\.nodu-mobile-event-detail\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventFloatingPanelRule = css.match(/\.nodu-mobile-event-floating-panel\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventFloatingPanelCompactRule = css.match(/\.nodu-mobile-event-floating-panel--compact\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventWithdrawalDialogRule = css.match(/\.nodu-mobile-event-withdrawal-dialog\s*\{[\s\S]*?\}/)?.[0];

    [
      '--nodu-paper',
      '--nodu-accent',
      '.nodu-app-shell',
      '.nodu-page-frame',
      '.nodu-surface',
      '.nodu-panel',
      '.nodu-sidebar-shell',
      '.nodu-app-shell--mobile-crew',
      '.nodu-page-frame--mobile-crew',
      '.nodu-mobile-crew-nav',
      '.nodu-mobile-crew-nav-item',
      '.nodu-mobile-timelog-modal',
      '.nodu-mobile-timelog-calendar',
      '.nodu-mobile-timelog-day-count',
      '.nodu-mobile-timelog-day--outside',
      '.nodu-mobile-timelog-entry-card',
      '.nodu-mobile-timelog-entry-heading',
      '.nodu-mobile-timelog-entry-hours',
      '.nodu-mobile-timelog-overnight-chip',
      '.nodu-mobile-timelog-report-editor',
      '.nodu-mobile-timelog-time-picker',
      '.nodu-mobile-timelog-time-label',
      '.nodu-mobile-timelog-time-confirm',
      '.nodu-mobile-timelog-time-trigger',
      '.nodu-mobile-timelog-time-wheel',
      '.nodu-mobile-timelog-time-wheel-selection',
      '.nodu-mobile-timelog-time-column',
      '.nodu-mobile-timelog-add-day-picker',
      '.nodu-mobile-timelog-add-day-picker-grid',
      '.nodu-mobile-timelog-add-day-cell',
      '.nodu-mobile-timelog-add-day-cell--selected',
      '.nodu-mobile-timelog-add-day-confirm',
      '.nodu-mobile-event-floating-panel',
      '.nodu-mobile-event-floating-panel--compact',
      '.nodu-mobile-event-withdrawal-dialog',
      '.nodu-stat-card',
      '.nodu-dashboard-action',
      '.dark .nodu-sidebar-shell',
      '.dark .nodu-stat-card',
    ].forEach((token) => {
      expect(css).toContain(token);
    });

    expect(darkTokenBlock).toContain('--nodu-surface-rgb: 35 27 22;');
    expect(darkTokenBlock).toContain('--nodu-text-rgb: 245 234 223;');
    expect(sidebarShellRule).toContain('var(--nodu-paper-rgb');
    expect(sidebarShellRule).toContain('var(--nodu-paper-strong-rgb');
    expect(sidebarSurfaceRule).toContain('var(--nodu-surface-rgb)');
    expect(sidebarSearchRule).toContain('var(--nodu-surface-rgb)');
    expect(statCardRule).toContain('var(--nodu-surface-rgb)');
    expect(dashboardActionRule).toContain('var(--nodu-surface-rgb)');
    expect(darkSidebarShellRule).toContain('!important');
    expect(darkSidebarSearchRule).toContain('!important');
    expect(darkStatCardRule).toContain('!important');
    expect(darkJobBadgeRule).toContain('var(--nodu-accent-rgb)');
    expect(darkMetaBadgeRule).toContain('var(--nodu-surface-muted-rgb)');
    expect(darkMetaBadgeRule).toContain('var(--nodu-text-soft)');
    expect(mobileCrewScrollbarRule).toContain('-ms-overflow-style: none;');
    expect(mobileCrewWebkitScrollbarRule).toContain('display: none;');
    expect(mobileTimelogModalRule).toContain('height: 100dvh;');
    expect(mobileTimelogModalRule).toContain('border-radius: 0;');
    expect(mobileTimelogHeaderRule).toContain('position: sticky;');
    expect(mobileTimelogFooterRule).toContain('position: sticky;');
    expect(mobileTimelogPanelRule).toContain('background: rgb(var(--nodu-accent-rgb) / 0.07);');
    expect(mobileTimelogTimeLabelRule).toContain('text-align: center;');
    expect(mobileTimelogTimeConfirmRule).toContain('position: absolute;');
    expect(mobileTimelogTimeConfirmRule).toContain('border-radius: 999px;');
    expect(mobileTimelogTimeWheelRule).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(mobileTimelogTimeWheelRule).toContain('overflow: hidden;');
    expect(mobileTimelogTimeColumnRule).toContain('scroll-snap-type: y mandatory;');
    expect(mobileTimelogTimeColumnRule).toContain('scrollbar-width: none;');
    expect(mobileTimelogAddDayPickerRule).toContain('border: 1px solid rgb(var(--nodu-accent-rgb) / 0.16);');
    expect(mobileTimelogAddDayPickerRule).toContain('background: rgb(var(--nodu-accent-rgb) / 0.07);');
    expect(mobileTimelogAddDayPickerGridRule).toContain('grid-template-columns: repeat(7, minmax(0, 1fr));');
    expect(mobileTimelogAddDayCellRule).toContain('aspect-ratio: 1;');
    expect(mobileTimelogAddDayConfirmRule).toContain('border-radius: 999px;');
    expect(mobileEventDetailRule).toContain('padding-bottom');
    expect(mobileEventFloatingPanelRule).toContain('position: fixed;');
    expect(mobileEventFloatingPanelRule).toContain('backdrop-filter: blur');
    expect(mobileEventFloatingPanelCompactRule).toContain('grid-template-areas: "primary";');
    expect(mobileEventFloatingPanelCompactRule).toContain('padding: 0.35rem;');
    expect(mobileEventWithdrawalDialogRule).toContain('position: fixed;');
    expect(css).not.toContain('.nodu-mobile-timelog-date-input');
    expect(css).not.toContain('.nodu-mobile-timelog-report-editor {\n  border-color: rgb(var(--nodu-text-rgb) / 0.1);');
    expect(sidebarShellRule).not.toContain('255, 250, 244');
    expect(sidebarSurfaceRule).not.toContain('255, 255, 255');
  });
});
