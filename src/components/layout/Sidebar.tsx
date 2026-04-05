import React from 'react';
import { Search, Settings } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { NAV_ITEMS } from '../../constants';

/**
 * Sidebar — boční navigace aplikace.
 * Obsahuje: logo, vyhledávání, přepínač rolí (HoC / COO),
 * navigační položky s badge počty a uživatelský profil.
 */
const Sidebar: React.FC = () => {
  const {
    role, setRole,
    currentTab, setCurrentTab,
    searchQuery, setSearchQuery,
    setSelectedContractorId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
    setSelectedClientIdForStats,
    timelogs,
    invoices,
    candidates,
    darkMode,
  } = useAppContext();

  /** Počty pro badge u navigačních položek */
  const badgeCounts: Record<string, number> = {
    timelogs: timelogs.filter(t => t.status === 'pending_hoc' || t.status === 'pending_coo').length,
    approvals: timelogs.filter(t => role === 'hoc' ? t.status === 'pending_hoc' : t.status === 'pending_coo').length,
    invoices: invoices.filter(i => i.status === 'draft').length,
    recruitment: candidates.filter(c => c.stage === 'new').length,
  };

  /** Kliknutí na navigační položku — přepne tab a resetuje detaily */
  const handleNavClick = (tabId: string) => {
    setCurrentTab(tabId);
    setSelectedContractorId(null);
    setSelectedEventId(null);
    setSelectedProjectIdForStats(null);
    setSelectedClientIdForStats(null);
  };

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <div className="text-base font-semibold text-gray-900 tracking-tight">CrewFlow</div>
        <div className="text-[11px] text-gray-500 mt-0.5">Crew management</div>
      </div>

      {/* Vyhledávání */}
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

      {/* Přepínač rolí */}
      <div className="p-3 border-b border-gray-200">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Zobrazuji jako</div>
        <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setRole('hoc')}
            className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${role === 'hoc' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Head of Crew
          </button>
          <button
            onClick={() => setRole('coo')}
            className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${role === 'coo' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            COO
          </button>
        </div>
      </div>

      {/* Navigace */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const badge = badgeCounts[item.id] || 0;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                currentTab === item.id
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
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

      {/* Nastavení — oddělené pod navigací */}
      <div className="p-2 border-t border-gray-200">
        <button
          onClick={() => handleNavClick('settings')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
            currentTab === 'settings'
              ? 'bg-emerald-50 text-emerald-700 font-medium'
              : 'text-gray-600 hover:bg-white hover:text-gray-900'
          }`}
        >
          <Settings size={16} />
          <span className="flex-1 text-left">Nastavení</span>
        </button>
      </div>

      {/* Uživatelský profil */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="av w-8 h-8 bg-blue-50 text-blue-700 text-[10px]">TM</div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">Petr Heitzer</div>
            <div className="text-[10px] text-gray-500">Crew Head</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          API ready · v2.0
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
