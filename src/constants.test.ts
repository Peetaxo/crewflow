import { describe, expect, it } from 'vitest';
import { getNavItemsForRole } from './constants';

describe('navigation items by role', () => {
  it('shows Fleet only to crewhead and coo roles', () => {
    expect(getNavItemsForRole('crew').map((item) => item.id)).not.toContain('fleet');
    expect(getNavItemsForRole('crewhead').map((item) => item.id)).toContain('fleet');
    expect(getNavItemsForRole('coo').map((item) => item.id)).toContain('fleet');
  });
});
