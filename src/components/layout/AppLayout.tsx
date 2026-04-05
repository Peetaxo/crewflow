import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import Sidebar from './Sidebar';

/* Views */
import DashboardView from '../../views/DashboardView';
import MyShiftsView from '../../views/MyShiftsView';
import ClientsView from '../../views/ClientsView';
import ClientStatsView from '../../views/ClientStatsView';
import ProjectsView from '../../views/ProjectsView';
import ProjectStatsView from '../../views/ProjectStatsView';
import EventsView from '../../views/EventsView';
import EventDetailView from '../../views/EventDetailView';
import CrewView from '../../views/CrewView';
import CrewDetailView from '../../views/CrewDetailView';
import TimelogsView from '../../views/TimelogsView';
import ApprovalsView from '../../views/ApprovalsView';
import InvoicesView from '../../views/InvoicesView';
import RecruitmentView from '../../views/RecruitmentView';
import SettingsView from '../../views/SettingsView';

/* Modály */
import TimelogEditModal from '../modals/TimelogEditModal';
import EventEditModal from '../modals/EventEditModal';
import ProjectEditModal from '../modals/ProjectEditModal';
import ClientEditModal from '../modals/ClientEditModal';
import AssignCrewModal from '../modals/AssignCrewModal';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';

/**
 * AppLayout — hlavní rozvržení aplikace.
 * Sidebar + hlavní obsah s AnimatePresence přepínáním tabů.
 */
const AppLayout: React.FC = () => {
  const {
    darkMode,
    currentTab,
    selectedContractorId,
    selectedEventId,
    selectedProjectIdForStats,
    selectedClientIdForStats,
  } = useAppContext();

  /** Vykreslí aktivní view podle currentTab + detail states */
  const renderCurrentView = () => {
    /* Detail views mají prioritu */
    if (selectedContractorId !== null) return <CrewDetailView key="crew-detail" />;
    if (selectedEventId !== null) return <EventDetailView key="event-detail" />;
    if (selectedProjectIdForStats !== null) return <ProjectStatsView key="project-stats" />;
    if (selectedClientIdForStats !== null) return <ClientStatsView key="client-stats" />;

    switch (currentTab) {
      case 'dashboard': return <DashboardView key="dashboard" />;
      case 'my-shifts': return <MyShiftsView key="my-shifts" />;
      case 'clients': return <ClientsView key="clients" />;
      case 'projects': return <ProjectsView key="projects" />;
      case 'events': return <EventsView key="events" />;
      case 'crew': return <CrewView key="crew" />;
      case 'timelogs': return <TimelogsView key="timelogs" />;
      case 'approvals': return <ApprovalsView key="approvals" />;
      case 'invoices': return <InvoicesView key="invoices" />;
      case 'recruitment': return <RecruitmentView key="recruitment" />;
      case 'settings': return <SettingsView key="settings" />;
      default: return <DashboardView key="dashboard" />;
    }
  };

  return (
    <div className={`flex h-screen font-sans overflow-hidden ${darkMode ? 'dark' : ''} bg-gray-50`}>
      <Sidebar />

      {/* Hlavní obsah */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {renderCurrentView()}
          </AnimatePresence>
        </div>
      </main>

      {/* Globální modály */}
      <TimelogEditModal />
      <EventEditModal />
      <ProjectEditModal />
      <ClientEditModal />
      <AssignCrewModal />
      <DeleteConfirmModal />
    </div>
  );
};

export default AppLayout;
