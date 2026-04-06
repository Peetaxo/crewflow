import React from 'react';
import { Search, Settings } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { getNavItemsForRole, ROLE_LABELS, ROLE_SHORT_LABELS } from '../../constants';

const Sidebar: React.FC = () => {
  const {
    role, setRole,
    currentTab, setCurrentTab,
    setSettingsSection,
    searchQuery, setSearchQuery,
    setSelectedContractorId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
    setSelectedClientIdForStats,
    timelogs,
    invoices,
    candidates,
  } = useAppContext();

  const navItems = getNavItemsForRole(role);
  const approvalStatus = role === 'crewhead' ? 'pending_ch' : 'pending_coo';

  const badgeCounts: Record<string, number> = {
    timelogs: timelogs.filter((t) => t.status === 'pending_ch' || t.status === 'pending_coo').length,
    'my-timelogs': timelogs.filter((t) => t.cid === 1 && (t.status === 'draft' || t.status === 'pending_ch' || t.status === 'pending_coo' || t.status === 'rejected')).length,
    approvals: role === 'crew' ? 0 : timelogs.filter((t) => t.status === approvalStatus).length,
    invoices: invoices.filter((i) => i.status === 'sent' || i.status === 'disputed').length,
    'my-invoices': invoices.filter((i) => i.cid === 1 && i.status !== 'paid').length,
    recruitment: candidates.filter((c) => c.stage === 'new').length,
  };

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

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-200">
        <div className="text-base font-semibold text-gray-900 tracking-tight">Event Helper</div>
        <div className="text-[11px] text-gray-500 mt-0.5">Crew Managment</div>
      </div>

      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Hledat akci, job nebo jméno..."
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="p-3 border-b border-gray-200">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Zobrazuji jako</div>
        <div className="grid grid-cols-3 bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
          {(['crew', 'crewhead', 'coo'] as const).map((roleOption) => (
            <button
              key={roleOption}
              onClick={() => setRole(roleOption)}
              className={`py-1 rounded-md text-[11px] font-medium transition-all ${role === roleOption ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {ROLE_SHORT_LABELS[roleOption]}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map((item) => {
          const badge = badgeCounts[item.id] || 0;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${currentTab === item.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
            >
              <item.icon size={16} />
              <span className="flex-1 text-left">{item.label}</span>
              {badge > 0 && (
                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-gray-200">
        <button
          onClick={() => openSettings('menu')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${currentTab === 'settings' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
        >
          <Settings size={16} />
          <span className="flex-1 text-left">Nastavení</span>
        </button>
      </div>

      <button onClick={() => openSettings('profile')} className="p-4 border-t border-gray-200 text-left hover:bg-white transition-colors">
        <div className="flex items-center gap-3">
          <div className="av w-8 h-8 bg-blue-50 text-blue-700 text-[10px]">TM</div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">Petr Heitzer</div>
            <div className="text-[10px] text-gray-500">{ROLE_LABELS[role]}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          API ready · v2.0
        </div>
      </button>
    </aside>
  );
};

export default Sidebar;
