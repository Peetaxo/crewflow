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
    const mobileCrewNavRule = css.match(/\.nodu-mobile-crew-nav\s*\{[\s\S]*?\}/)?.[0];
    const mobileCrewNavItemRule = css.match(/\.nodu-mobile-crew-nav-item\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogModalRule = css.match(/\.nodu-mobile-timelog-modal\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogLayerRule = css.match(/\.nodu-mobile-timelog-layer\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogSwipeEdgeRule = css.match(/\.nodu-mobile-timelog-swipe-edge\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogHeaderRule = css.match(/\.nodu-mobile-timelog-header\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogBodyRule = css.match(/\.nodu-mobile-timelog-body\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogFooterRule = css.match(/\.nodu-mobile-timelog-footer\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogPanelRule = css.match(/\.nodu-mobile-timelog-summary,\s*\.nodu-mobile-timelog-day-editor,\s*\.nodu-mobile-timelog-report-editor\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogSummaryRule = css.match(/\.nodu-mobile-timelog-summary\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeLabelRule = css.match(/\.nodu-mobile-timelog-time-label\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeConfirmRule = css.match(/\.nodu-mobile-timelog-time-confirm\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeWheelRule = css.match(/\.nodu-mobile-timelog-time-wheel\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogTimeColumnRule = css.match(/\.nodu-mobile-timelog-time-column\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayPickerRule = css.match(/\.nodu-mobile-timelog-add-day-picker\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayPickerGridRule = css.match(/\.nodu-mobile-timelog-add-day-picker-grid\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayCellRule = css.match(/\.nodu-mobile-timelog-add-day-cell\s*\{[\s\S]*?\}/)?.[0];
    const mobileTimelogAddDayConfirmRule = css.match(/\.nodu-mobile-timelog-add-day-confirm\s*\{[\s\S]*?\}/)?.[0];
    const mobilePageFrameRule = css.match(/\.nodu-page-frame--mobile-crew\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventDetailRule = css.match(/\.nodu-mobile-event-detail\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventSwipeSurfaceRule = css.match(/\.nodu-mobile-event-swipe-surface\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventSwipeEdgeRule = css.match(/\.nodu-mobile-event-swipe-edge\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventBackRule = css.match(/\.nodu-mobile-event-back\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventFloatingPanelRule = css.match(/\.nodu-mobile-event-floating-panel\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventFloatingPanelCompactRule = css.match(/\.nodu-mobile-event-floating-panel--compact\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventActionButtonRule = css.match(/\.nodu-mobile-event-evidence-button,\s*\.nodu-mobile-event-withdraw-button\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventApprovalDialogRule = css.match(/\.nodu-mobile-event-approval-dialog\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventApprovalPanelRule = css.match(/\.nodu-mobile-event-approval-panel\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventWithdrawButtonRule = Array.from(css.matchAll(/\.nodu-mobile-event-withdraw-button\s*\{[\s\S]*?\}/g))
      .map((match) => match[0])
      .find((rule) => rule.includes('grid-area: secondary;'));
    const mobileEventWithdrawalDialogRule = css.match(/\.nodu-mobile-event-withdrawal-dialog\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventsToolbarRule = css.match(/\.nodu-mobile-events-toolbar\s*\{[\s\S]*?\}/)?.[0];
    const mobileEventsHeaderRule = css.match(/\.nodu-mobile-events-header\s*\{[\s\S]*?\}/)?.[0];

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
      '.nodu-mobile-timelog-layer',
      '.nodu-mobile-timelog-swipe-edge',
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
      '.nodu-mobile-event-swipe-surface',
      '.nodu-mobile-event-swipe-edge',
      '.nodu-mobile-event-floating-panel',
      '.nodu-mobile-event-floating-panel--compact',
      '.nodu-mobile-event-approval-dialog',
      '.nodu-mobile-event-approval-panel',
      '.nodu-mobile-event-withdrawal-dialog',
      '.nodu-mobile-events-toolbar',
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
    expect(mobileCrewNavRule).toContain('right: max(1.1rem, env(safe-area-inset-right));');
    expect(mobileCrewNavRule).toContain('left: max(1.1rem, env(safe-area-inset-left));');
    expect(mobileCrewNavRule).toContain('min-height: 4rem;');
    expect(mobileCrewNavRule).toContain('padding: 0.3rem;');
    expect(mobileCrewNavItemRule).toContain('min-height: 3rem;');
    expect(mobileTimelogModalRule).toContain('height: 100dvh;');
    expect(mobileTimelogModalRule).toContain('border-radius: 0;');
    expect(mobileTimelogModalRule).toContain('transform: translateX(var(--nodu-mobile-timelog-swipe-x, 0));');
    expect(mobileTimelogModalRule).toContain('opacity: var(--nodu-mobile-timelog-swipe-opacity, 1);');
    expect(mobileTimelogModalRule).toContain('background: rgb(var(--nodu-paper-rgb) / 1);');
    expect(mobileTimelogLayerRule).toContain('background: transparent;');
    expect(mobileTimelogSwipeEdgeRule).toContain('position: fixed;');
    expect(mobileTimelogSwipeEdgeRule).toContain('left: 0;');
    expect(mobileTimelogSwipeEdgeRule).toContain('touch-action: none;');
    expect(mobileTimelogHeaderRule).toContain('position: sticky;');
    expect(mobileTimelogHeaderRule).toContain('background: rgb(var(--nodu-paper-rgb) / 1);');
    expect(mobileTimelogBodyRule).toContain('background: rgb(var(--nodu-paper-rgb) / 1);');
    expect(mobileTimelogFooterRule).toContain('position: sticky;');
    expect(mobileTimelogPanelRule).toContain('background: rgb(var(--nodu-accent-rgb) / 0.07);');
    expect(mobileTimelogSummaryRule).toContain('rgb(var(--nodu-paper-rgb) / 1)');
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
    expect(mobilePageFrameRule).toContain('padding-top: calc(1rem + env(safe-area-inset-top));');
    expect(mobileEventDetailRule).toContain('position: fixed;');
    expect(mobileEventDetailRule).toContain('inset: 0;');
    expect(mobileEventDetailRule).toContain('z-index: 70;');
    expect(mobileEventDetailRule).toContain('background: transparent;');
    expect(mobileEventDetailRule).toContain('overflow-y: auto;');
    expect(mobileEventSwipeSurfaceRule).toContain('transform: translateX(var(--nodu-mobile-event-swipe-x, 0));');
    expect(mobileEventSwipeSurfaceRule).toContain('opacity: var(--nodu-mobile-event-swipe-opacity, 1);');
    expect(mobileEventSwipeSurfaceRule).toContain('padding: calc(1rem + env(safe-area-inset-top)) 1rem calc(6.5rem + env(safe-area-inset-bottom));');
    expect(mobileEventSwipeSurfaceRule).toContain('box-shadow: -18px 0 44px');
    expect(mobileEventSwipeEdgeRule).toContain('position: fixed;');
    expect(mobileEventSwipeEdgeRule).toContain('left: 0;');
    expect(mobileEventSwipeEdgeRule).toContain('pointer-events: none;');
    expect(mobileEventSwipeEdgeRule).toContain('touch-action: none;');
    expect(mobileEventBackRule).toContain('touch-action: manipulation;');
    expect(mobileEventFloatingPanelRule).toContain('position: fixed;');
    expect(mobileEventFloatingPanelRule).toContain('z-index: 80;');
    expect(mobileEventFloatingPanelRule).toContain('right: max(1.1rem, env(safe-area-inset-right));');
    expect(mobileEventFloatingPanelRule).toContain('bottom: max(0.75rem, env(safe-area-inset-bottom));');
    expect(mobileEventFloatingPanelRule).toContain('left: max(1.1rem, env(safe-area-inset-left));');
    expect(mobileEventFloatingPanelRule).toContain('pointer-events: auto;');
    expect(mobileEventFloatingPanelRule).toContain('transform: translateX(var(--nodu-mobile-event-swipe-x, 0));');
    expect(mobileEventFloatingPanelRule).toContain('transition: var(--nodu-mobile-event-swipe-transition, none);');
    expect(mobileEventFloatingPanelRule).toContain('padding: 0.45rem;');
    expect(mobileEventFloatingPanelRule).toContain('backdrop-filter: blur');
    expect(mobileEventActionButtonRule).toContain('touch-action: manipulation;');
    expect(mobileEventActionButtonRule).toContain('-webkit-tap-highlight-color: transparent;');
    expect(mobileEventFloatingPanelCompactRule).toContain('grid-template-areas: "primary";');
    expect(mobileEventFloatingPanelCompactRule).toContain('padding: 0.35rem;');
    expect(mobileEventApprovalDialogRule).toContain('align-items: stretch;');
    expect(mobileEventApprovalDialogRule).toContain('background: rgb(var(--nodu-paper-rgb) / 0.98);');
    expect(mobileEventApprovalDialogRule).not.toContain('align-items: flex-end;');
    expect(mobileEventApprovalPanelRule).toContain('height: 100dvh;');
    expect(mobileEventApprovalPanelRule).toContain('border-radius: 0;');
    expect(mobileEventApprovalPanelRule).toContain('box-shadow: none;');
    expect(mobileEventWithdrawButtonRule).toContain('border: 1px solid rgb(220 38 38 / 0.22);');
    expect(mobileEventWithdrawButtonRule).toContain('background: rgb(254 242 242 / 0.94);');
    expect(mobileEventWithdrawButtonRule).toContain('color: rgb(185 28 28);');
    expect(mobileEventWithdrawalDialogRule).toContain('position: fixed;');
    expect(mobileEventWithdrawalDialogRule).toContain('z-index: 95;');
    expect(mobileEventDetailRule).toContain('touch-action: pan-y;');
    expect(mobileEventDetailRule).toContain('overscroll-behavior-x: contain;');
    expect(mobileEventsToolbarRule).toContain('margin-bottom: 0.25rem;');
    expect(mobileEventsHeaderRule).toContain('margin-bottom: 0;');
    expect(css).not.toContain('.nodu-mobile-timelog-date-input');
    expect(css).not.toContain('.nodu-mobile-timelog-report-editor {\n  border-color: rgb(var(--nodu-text-rgb) / 0.1);');
    expect(sidebarShellRule).not.toContain('255, 250, 244');
    expect(sidebarSurfaceRule).not.toContain('255, 255, 255');
  });

  it('keeps event map pins upright and compact while link placement stays clear of map controls', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const eventMapLinkRule = css.match(/\.nodu-event-map-preview__link\s*\{[\s\S]*?\}/)?.[0];
    const eventMapMarkerRule = css.match(/\.nodu-event-map-marker\s*\{[\s\S]*?\}/)?.[0];
    const eventMapFixedPinRule = css.match(/\.nodu-event-map-preview__fixed-pin\s*\{[\s\S]*?\}/)?.[0];
    const eventLocationPickerPinRule = css.match(/\.nodu-event-location-picker-pin\s*\{[\s\S]*?\}/)?.[0];

    expect(eventMapLinkRule).toContain('left: 0.75rem;');
    expect(eventMapLinkRule).not.toContain('right: 0.75rem;');
    expect(eventMapMarkerRule).toContain('width: 1.25rem;');
    expect(eventMapMarkerRule).toContain('height: 1.65rem;');
    expect(eventMapMarkerRule).not.toContain('rotate(');
    expect(eventMapFixedPinRule).toContain('width: 1.25rem;');
    expect(eventMapFixedPinRule).not.toContain('rotate(');
    expect(eventLocationPickerPinRule).toContain('width: 1.25rem;');
    expect(eventLocationPickerPinRule).not.toContain('rotate(');
  });

  it('prevents iOS focus zoom by keeping mobile form controls at least 16px', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const mobileFormControlRule = css.match(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.nodu-app-shell--mobile-crew\s+:where\(input,\s*select,\s*textarea\)\s*\{[\s\S]*?\}[\s\S]*?\}/)?.[0];

    expect(mobileFormControlRule).toBeDefined();
    expect(mobileFormControlRule).toContain('font-size: 16px;');
  });
});
