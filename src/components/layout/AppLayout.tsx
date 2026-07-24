import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import { useIsMobile } from '../../hooks/use-mobile';
import { ROLE_LABELS, ROLE_SHORT_LABELS } from '../../constants';
import type { Role } from '../../types';
import Sidebar from './Sidebar';
import MobileCrewNav from './MobileCrewNav';
import { useNavBadgeCounts } from './useNavBadgeCounts';

import DashboardView from '../../views/DashboardView';
import MyShiftsView from '../../views/MyShiftsView';
import ClientsView from '../../views/ClientsView';
import ProjectsView from '../../views/ProjectsView';
import EventsView from '../../views/EventsView';
import CrewView from '../../views/CrewView';
import TimelogsView from '../../views/TimelogsView';
import InvoicesView from '../../views/InvoicesView';
import ReceiptsView from '../../views/ReceiptsView';
import RecruitmentView from '../../views/RecruitmentView';
import FleetView from '../../views/FleetView';
import WarehouseView from '../../views/WarehouseView';
import SettingsView from '../../views/SettingsView';

import TimelogEditModal from '../modals/TimelogEditModal';
import ProjectEditModal from '../modals/ProjectEditModal';
import ClientEditModal from '../modals/ClientEditModal';
import ReceiptEditModal from '../modals/ReceiptEditModal';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';

const mobileRoleOptions = ['crew', 'crewhead', 'coo'] as const;

const AppLayout: React.FC = () => {
  const {
    darkMode,
    currentTab,
    role,
    setRole,
    selectedEventId,
  } = useAppContext();
  const { isAuthRequired, isDevSession, isRoleSwitching, role: authRole, switchRole } = useAuth();
  const isMobile = useIsMobile();
  const badgeCounts = useNavBadgeCounts();
  const isMobileAppShell = isMobile;
  const isMobileCrewRole = role === 'crew';
  const isMobileEventDetail = isMobileAppShell && currentTab === 'events' && Boolean(selectedEventId);
  const effectiveRole = authRole ?? role;
  const showMobileRolePreviewSwitch = isMobileAppShell && (!isAuthRequired || isDevSession);

  const handleMobileRoleChange = React.useCallback(async (roleOption: Role) => {
    if (roleOption === effectiveRole || (isAuthRequired && isRoleSwitching)) return;

    if (!isAuthRequired) {
      setRole(roleOption);
      return;
    }

    try {
      await switchRole(roleOption);
      toast.success(`Role zmenena na ${ROLE_LABELS[roleOption]}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Zmena role se nepodarila.';
      toast.error(message);
    }
  }, [effectiveRole, isAuthRequired, isRoleSwitching, setRole, switchRole]);

  const renderCurrentView = () => {
    if (currentTab === 'settings') return <SettingsView key="settings" />;

    switch (currentTab) {
      case 'dashboard':
        return <DashboardView key="dashboard" />;
      case 'my-shifts':
        return <MyShiftsView key="my-shifts" />;
      case 'my-timelogs':
        return <TimelogsView key="my-timelogs" scope="mine" />;
      case 'my-invoices':
        return <InvoicesView key="my-invoices" scope="mine" />;
      case 'my-receipts':
        return <ReceiptsView key="my-receipts" scope="mine" />;
      case 'clients':
        return <ClientsView key="clients" />;
      case 'projects':
        return <ProjectsView key="projects" />;
      case 'events':
        return <EventsView key="events" />;
      case 'crew':
        return <CrewView key="crew" />;
      case 'fleet':
        return <FleetView key="fleet" />;
      case 'warehouse':
        return <WarehouseView key="warehouse" />;
      case 'timelogs':
      case 'approvals':
        return <TimelogsView key="timelogs" scope="all" />;
      case 'invoices':
        return <InvoicesView key="invoices" scope="all" />;
      case 'receipts':
        return <ReceiptsView key="receipts" scope="all" />;
      case 'recruitment':
        return <RecruitmentView key="recruitment" />;
      default:
        return <MyShiftsView key="my-shifts-default" />;
    }
  };

  return (
    <div className={`nodu-app-shell ${isMobileAppShell ? 'nodu-app-shell--mobile-crew' : ''} ${darkMode ? 'dark' : ''}`}>
      {!isMobileAppShell && <Sidebar />}

      {showMobileRolePreviewSwitch && (
        <div className="nodu-mobile-role-switcher" aria-label="Přepnutí role v mobilním preview">
          {mobileRoleOptions.map((roleOption) => (
            <button
              key={roleOption}
              type="button"
              onClick={() => { void handleMobileRoleChange(roleOption); }}
              disabled={isAuthRequired && isRoleSwitching}
              aria-label={ROLE_LABELS[roleOption]}
              aria-pressed={effectiveRole === roleOption}
              className={`nodu-mobile-role-switcher__button ${effectiveRole === roleOption ? 'nodu-mobile-role-switcher__button--active' : ''}`}
            >
              {ROLE_SHORT_LABELS[roleOption]}
            </button>
          ))}
        </div>
      )}

      <main className={`nodu-page-frame ${isMobileAppShell ? 'nodu-page-frame--mobile-crew' : ''}`}>
        <div className="mx-auto max-w-6xl">
          <AnimatePresence mode="wait">{renderCurrentView()}</AnimatePresence>
        </div>
      </main>

      {isMobileAppShell && isMobileCrewRole && !isMobileEventDetail && <MobileCrewNav badgeCounts={badgeCounts} />}

      <TimelogEditModal />
      <ProjectEditModal />
      <ReceiptEditModal />
      <ClientEditModal />
      <DeleteConfirmModal />
    </div>
  );
};

export default AppLayout;
