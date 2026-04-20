import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronsLeft, ChevronsRight, LogOut, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/providers/AuthProvider';
import { useAppContext } from '../../context/AppContext';
import { ReceiptItem, Timelog } from '../../types';
import { getNavItemsForRole, ROLE_LABELS, ROLE_SHORT_LABELS } from '../../constants';
import { getTimelogs, subscribeToTimelogChanges } from '../../features/timelogs/services/timelogs.service';
import { getReceipts, subscribeToReceiptChanges } from '../../features/receipts/services/receipts.service';
import { getInvoices, subscribeToInvoiceChanges } from '../../features/invoices/services/invoices.service';
import { getCandidates, subscribeToCandidateChanges } from '../../features/recruitment/services/candidates.service';

const Sidebar: React.FC = () => {
  const { currentProfileId, isAuthRequired, profile, role: authRole, signOut } = useAuth();
  const {
    sidebarCollapsed, setSidebarCollapsed,
    role, setRole,
    currentTab, setCurrentTab,
    setSettingsSection,
    searchQuery, setSearchQuery,
    setSelectedContractorId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
    setSelectedClientIdForStats,
  } = useAppContext();

  const [timelogs, setTimelogs] = useState<Timelog[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [invoices, setInvoices] = useState(() => getInvoices() ?? []);
  const [candidates, setCandidates] = useState(() => getCandidates() ?? []);

  const loadData = useCallback(() => {
    setTimelogs(getTimelogs() ?? []);
    setReceipts(getReceipts() ?? []);
    setInvoices(getInvoices() ?? []);
    setCandidates(getCandidates() ?? []);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToTimelogChanges(loadData), [loadData]);
  useEffect(() => subscribeToReceiptChanges(loadData), [loadData]);
  useEffect(() => subscribeToInvoiceChanges(loadData), [loadData]);
  useEffect(() => subscribeToCandidateChanges(loadData), [loadData]);

  const navItems = getNavItemsForRole(role);
  const effectiveRole = authRole ?? role;
  const profileName = profile ? `${profile.firstName} ${profile.lastName}`.trim() || profile.email : 'Petr Heitzer';

  const badgeCounts: Record<string, number> = useMemo(() => ({
    timelogs: timelogs.filter((t) => t.status === 'pending_ch' || t.status === 'pending_coo').length,
    'my-timelogs': timelogs.filter((t) => t.contractorProfileId === currentProfileId && (t.status === 'draft' || t.status === 'pending_ch' || t.status === 'pending_coo' || t.status === 'rejected')).length,
    invoices: invoices.filter((i) => i.status === 'sent').length,
    'my-invoices': invoices.filter((i) => i.contractorProfileId === currentProfileId && i.status !== 'paid').length,
    receipts: receipts.filter((r) => r.status === 'submitted' || r.status === 'approved').length,
    'my-receipts': receipts.filter((r) => r.contractorProfileId === currentProfileId && r.status !== 'reimbursed').length,
    recruitment: candidates.filter((c) => c.stage === 'new').length,
  }), [candidates, currentProfileId, invoices, receipts, timelogs]);

  const handleNavClick = (tabId: string) => {
    setCurrentTab(tabId);
    setSelectedContractorId(null);
    setSelectedEventId(null);
    setSelectedProjectIdForStats(null);
    setSelectedClientIdForStats(null);
  };

  const openSettings = (section: 'menu' | 'profile' | 'appearance' = 'menu') => {
    setSettingsSection(section);
    handleNavClick('settings');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Byl jsi odhlasen.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Odhlaseni se nepodarilo.';
      toast.error(message);
    }
  };

  return (
    <aside className={`flex shrink-0 flex-col border-r border-gray-200 bg-gray-50 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-56'}`}>
      <div className="border-b border-gray-200 p-4">
        <div className={`flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
          {sidebarCollapsed ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-bold text-emerald-700">
              EH
            </div>
          ) : (
            <div>
              <div className="text-base font-semibold tracking-tight text-gray-900">Event Helper</div>
              <div className="mt-0.5 text-[11px] text-gray-500">Crew Management</div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-emerald-200 hover:text-emerald-700"
            title={sidebarCollapsed ? 'Rozbalit panel' : 'Sbalit panel'}
          >
            {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
      </div>

      {!sidebarCollapsed ? (
        <div className="border-b border-gray-200 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Hledat akci, job nebo jmeno..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-[11px] transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="border-b border-gray-200 p-3">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white py-2 text-gray-500 transition-colors hover:border-emerald-200 hover:text-emerald-700"
            title="Rozbalit a hledat"
          >
            <Search size={16} />
          </button>
        </div>
      )}

      <div className="border-b border-gray-200 p-3">
        {!sidebarCollapsed ? (
          <>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-gray-500">
              {isAuthRequired ? 'Prihlasena role' : 'Zobrazuji jako'}
            </div>
            {isAuthRequired ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                {ROLE_LABELS[effectiveRole]}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
                {(['crew', 'crewhead', 'coo'] as const).map((roleOption) => (
                  <button
                    key={roleOption}
                    onClick={() => setRole(roleOption)}
                    className={`rounded-md py-1 text-[11px] font-medium transition-all ${role === roleOption ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    {ROLE_SHORT_LABELS[roleOption]}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          isAuthRequired ? (
            <div className="flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-semibold text-emerald-700">
              {ROLE_SHORT_LABELS[effectiveRole]}
            </div>
          ) : (
            <div className="space-y-2">
              {(['crew', 'crewhead', 'coo'] as const).map((roleOption) => (
                <button
                  key={roleOption}
                  onClick={() => setRole(roleOption)}
                  className={`flex w-full items-center justify-center rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all ${role === roleOption ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500 hover:text-gray-900'}`}
                  title={ROLE_LABELS[roleOption]}
                >
                  {ROLE_SHORT_LABELS[roleOption]}
                </button>
              ))}
            </div>
          )
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {navItems.map((item) => {
          const badge = badgeCounts[item.id] || 0;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`relative flex w-full items-center rounded-lg px-3 py-2 text-[13px] transition-colors ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} ${currentTab === item.id ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
              title={item.label}
            >
              <item.icon size={16} />
              {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
              {badge > 0 && (
                <span className={`rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ${sidebarCollapsed ? 'absolute right-1 top-1' : ''}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-2">
        <button
          onClick={() => openSettings('menu')}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-[13px] transition-colors ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} ${currentTab === 'settings' ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
          title="Nastaveni"
        >
          <Settings size={16} />
          {!sidebarCollapsed && <span className="flex-1 text-left">Nastaveni</span>}
        </button>
      </div>

      <button
        onClick={() => openSettings('profile')}
        className={`border-t border-gray-200 p-4 text-left transition-colors hover:bg-white ${sidebarCollapsed ? 'flex justify-center' : ''}`}
        title="Profil"
      >
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="av h-8 w-8 bg-blue-50 text-[10px] text-blue-700">
            {profileName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'PH'}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-gray-900">{profileName}</div>
              <div className="text-[10px] text-gray-500">{ROLE_LABELS[effectiveRole]}</div>
            </div>
          )}
        </div>
        {!sidebarCollapsed && (
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-500">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
            {profile?.email || 'API ready · v2.0'}
          </div>
        )}
      </button>

      {isAuthRequired && (
        <div className="border-t border-gray-200 p-2">
          <button
            onClick={handleSignOut}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-[13px] text-gray-600 transition-colors hover:bg-white hover:text-gray-900 ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}
            title="Odhlasit se"
          >
            <LogOut size={16} />
            {!sidebarCollapsed && <span className="flex-1 text-left">Odhlasit se</span>}
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
