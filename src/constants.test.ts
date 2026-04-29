import { describe, expect, it } from 'vitest';
import { getNavItemsForRole } from './constants';

describe('navigation items by role', () => {
  it('shows Fleet only to crewhead and coo roles', () => {
    expect(getNavItemsForRole('crew').map((item) => item.id)).not.toContain('fleet');
    expect(getNavItemsForRole('crewhead').map((item) => item.id)).toContain('fleet');
    expect(getNavItemsForRole('coo').map((item) => item.id)).toContain('fleet');
  });

  it('shows Warehouse only to crewhead and coo roles after Fleet', () => {
    expect(getNavItemsForRole('crew').map((item) => item.id)).not.toContain('warehouse');

    const crewheadItems = getNavItemsForRole('crewhead').map((item) => item.id);
    const cooItems = getNavItemsForRole('coo').map((item) => item.id);

    expect(crewheadItems).toContain('warehouse');
    expect(cooItems).toContain('warehouse');
    expect(crewheadItems.indexOf('warehouse')).toBe(crewheadItems.indexOf('fleet') + 1);
    expect(cooItems.indexOf('warehouse')).toBe(cooItems.indexOf('fleet') + 1);
  });
});
