import React from 'react';
import { House } from 'lucide-react';
import { getNavItemsForRole, type NavItemId } from '../../constants';
import { useAppContext } from '../../context/useAppContext';
import type { Role } from '../../types';

const mobileLabels: Partial<Record<NavItemId, string>> = {
  dashboard: 'Přehled',
  'my-shifts': 'Přehled',
  events: 'Akce',
  timelogs: 'Schvalování',
  projects: 'Projekty',
  'my-timelogs': 'Výkazy',
  'my-invoices': 'Faktury',
  'my-receipts': 'Účtenky',
  crew: 'Crew',
};

const managementNavItemIds: NavItemId[] = ['dashboard', 'events', 'timelogs', 'projects', 'crew'];
const crewMobileNavItemIds: NavItemId[] = ['my-shifts', 'events', 'my-timelogs', 'my-invoices'];

interface MobileCrewNavProps {
  badgeCounts: Record<string, number>;
  role?: Role;
}

const MobileCrewNav: React.FC<MobileCrewNavProps> = ({ badgeCounts, role = 'crew' }) => {
  const {
    currentTab,
    setCurrentTab,
    setSelectedContractorProfileId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
    setSelectedClientIdForStats,
  } = useAppContext();
  const isCrewNav = role === 'crew';
  const roleNavItems = getNavItemsForRole(role);
  const navItems = isCrewNav
    ? crewMobileNavItemIds
      .map((itemId) => roleNavItems.find((item) => item.id === itemId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : managementNavItemIds
      .map((itemId) => roleNavItems.find((item) => item.id === itemId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const handleNavClick = (tabId: string) => {
    setCurrentTab(tabId);
    setSelectedContractorProfileId(null);
    setSelectedEventId(null);
    setSelectedProjectIdForStats(null);
    setSelectedClientIdForStats(null);
  };

  const navClassName = `nodu-mobile-crew-nav ${navItems.length === 4 ? 'nodu-mobile-crew-nav--4' : ''}`;
  const navLabel = isCrewNav ? 'Mobilní navigace Crew' : 'Mobilní navigace Management';

  return (
    <nav className={navClassName} aria-label={navLabel}>
      {navItems.map((item) => {
        const isActive = currentTab === item.id;
        const badge = badgeCounts[item.id] || 0;
        const label = mobileLabels[item.id] ?? item.label;
        const Icon = item.id === 'my-shifts' || item.id === 'dashboard' ? House : item.icon;
        const buttonLabel = isCrewNav && item.id !== 'my-shifts' ? item.label : label;

        return (
          <button
            key={item.id}
            type="button"
            aria-label={buttonLabel}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => handleNavClick(item.id)}
            className={`nodu-mobile-crew-nav-item ${isActive ? 'nodu-mobile-crew-nav-item--active' : ''}`}
          >
            <span className="relative">
              <Icon size={18} aria-hidden="true" />
              {badge > 0 && <span className="nodu-mobile-crew-nav-badge">{badge}</span>}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileCrewNav;
