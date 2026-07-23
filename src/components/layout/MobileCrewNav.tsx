import React from 'react';
import { getNavItemsForRole, type NavItemId } from '../../constants';
import { useAppContext } from '../../context/useAppContext';

const mobileLabels: Partial<Record<NavItemId, string>> = {
  'my-shifts': 'Směny',
  events: 'Akce',
  'my-timelogs': 'Výkazy',
  'my-invoices': 'Faktury',
  'my-receipts': 'Účtenky',
};

interface MobileCrewNavProps {
  badgeCounts: Record<string, number>;
}

const MobileCrewNav: React.FC<MobileCrewNavProps> = ({ badgeCounts }) => {
  const {
    currentTab,
    setCurrentTab,
    setSelectedContractorProfileId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
    setSelectedClientIdForStats,
  } = useAppContext();
  const navItems = getNavItemsForRole('crew');

  const handleNavClick = (tabId: string) => {
    setCurrentTab(tabId);
    setSelectedContractorProfileId(null);
    setSelectedEventId(null);
    setSelectedProjectIdForStats(null);
    setSelectedClientIdForStats(null);
  };

  return (
    <nav className="nodu-mobile-crew-nav" aria-label="Mobilní navigace Crew">
      {navItems.map((item) => {
        const isActive = currentTab === item.id;
        const badge = badgeCounts[item.id] || 0;
        const label = mobileLabels[item.id] ?? item.label;

        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => handleNavClick(item.id)}
            className={`nodu-mobile-crew-nav-item ${isActive ? 'nodu-mobile-crew-nav-item--active' : ''}`}
          >
            <span className="relative">
              <item.icon size={18} aria-hidden="true" />
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
