import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/useAppContext';
import { useIsMobile } from '../../hooks/use-mobile';
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

const AppLayout: React.FC = () => {
  const {
    darkMode,
    currentTab,
    role,
  } = useAppContext();
  const isMobile = useIsMobile();
  const badgeCounts = useNavBadgeCounts();
  const isMobileCrewShell = isMobile && role === 'crew';

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
    <div className={`nodu-app-shell ${isMobileCrewShell ? 'nodu-app-shell--mobile-crew' : ''} ${darkMode ? 'dark' : ''}`}>
      {!isMobileCrewShell && <Sidebar />}

      <main className={`nodu-page-frame ${isMobileCrewShell ? 'nodu-page-frame--mobile-crew' : ''}`}>
        <div className="mx-auto max-w-6xl">
          <AnimatePresence mode="wait">{renderCurrentView()}</AnimatePresence>
        </div>
      </main>

      {isMobileCrewShell && <MobileCrewNav badgeCounts={badgeCounts} />}

      <TimelogEditModal />
      <ProjectEditModal />
      <ReceiptEditModal />
      <ClientEditModal />
      <DeleteConfirmModal />
    </div>
  );
};

export default AppLayout;
