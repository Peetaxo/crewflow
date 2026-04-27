import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsLeft, ChevronsRight, LogOut, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/providers/AuthProvider';
import { useAppContext } from '../../context/AppContext';
import { getNavItemsForRole, ROLE_LABELS, ROLE_SHORT_LABELS } from '../../constants';
import { getCandidates, subscribeToCandidateChanges } from '../../features/recruitment/services/candidates.service';
import { useTimelogsQuery } from '../../features/timelogs/queries/useTimelogsQuery';
import { useReceiptsQuery } from '../../features/receipts/queries/useReceiptsQuery';
import { useInvoicesQuery } from '../../features/invoices/queries/useInvoicesQuery';

const navButtonBaseClass = 'relative flex w-full items-center rounded-xl px-3 py-2.5 text-[13px] transition-all';
const navButtonIdleClass = 'border border-transparent nodu-nav-idle';
const navButtonActiveClass = 'nodu-nav-active font-medium text-[color:var(--nodu-accent)]';

const Sidebar: React.FC = () => {
  const { currentProfileId, isAuthRequired, profile, role: authRole, signOut } = useAuth();
  const timelogsQuery = useTimelogsQuery();
  const receiptsQuery = useReceiptsQuery();
  const invoicesQuery = useInvoicesQuery();
  const {
    sidebarCollapsed, setSidebarCollapsed,
    role, setRole,
    currentTab, setCurrentTab,
    setSettingsSection,
    searchQuery, setSearchQuery,
    setSelectedContractorProfileId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
    setSelectedClientIdForStats,
  } = useAppContext();

  const [candidates, setCandidates] = useState(() => getCandidates() ?? []);
  const navRef = useRef<HTMLElement | null>(null);
  const [showScrollHintTop, setShowScrollHintTop] = useState(false);
  const [showScrollHintBottom, setShowScrollHintBottom] = useState(false);

  const loadData = useCallback(() => {
    setCandidates(getCandidates() ?? []);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToCandidateChanges(loadData), [loadData]);
  const timelogs = useMemo(() => timelogsQuery.data ?? [], [timelogsQuery.data]);
  const receipts = useMemo(() => receiptsQuery.data ?? [], [receiptsQuery.data]);
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);

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

  const updateScrollHints = useCallback(() => {
    const node = navRef.current;
    if (!node) {
      setShowScrollHintTop(false);
      setShowScrollHintBottom(false);
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = node;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    setShowScrollHintTop(scrollTop > 8);
    setShowScrollHintBottom(maxScrollTop - scrollTop > 8);
  }, []);

  const handleNavClick = (tabId: string) => {
    setCurrentTab(tabId);
    setSelectedContractorProfileId(null);
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

  useEffect(() => {
    updateScrollHints();
  }, [sidebarCollapsed, navItems.length, updateScrollHints]);

  useEffect(() => {
    const node = navRef.current;
    if (!node) return;

    updateScrollHints();
    node.addEventListener('scroll', updateScrollHints, { passive: true });
    window.addEventListener('resize', updateScrollHints);

    return () => {
      node.removeEventListener('scroll', updateScrollHints);
      window.removeEventListener('resize', updateScrollHints);
    };
  }, [updateScrollHints]);

  return (
    <aside className={`nodu-sidebar-shell flex shrink-0 flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
      <div className="nodu-sidebar-divider p-4">
        <div className={`flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="flex h-11 w-11 items-center justify-center rounded-[18px] transition-transform hover:scale-[1.03]"
              title="Rozbalit panel"
            >
              <img src="/nodu-mark.svg" alt="Nodu" className="h-8 w-8 object-contain" />
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                <img src="/nodu-mark.svg" alt="Nodu" className="h-8 w-8 object-contain" />
              </div>
              <img src="/nodu-wordmark.svg" alt="nodu." className="h-6 w-auto max-w-[92px] object-contain" />
            </div>
          )}

          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="nodu-sidebar-control flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition-colors hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
            title={sidebarCollapsed ? 'Rozbalit panel' : 'Sbalit panel'}
          >
            {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
      </div>

      {!sidebarCollapsed ? (
        <div className="nodu-sidebar-divider p-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-[color:var(--nodu-text-soft)]" size={14} />
            <input
              type="text"
              placeholder="Hledat akci, job nebo jmeno..."
              className="nodu-sidebar-search nodu-sidebar-control w-full rounded-xl border border-[color:var(--nodu-border)] py-2.5 pl-9 pr-3 text-[11px] text-[color:var(--nodu-text)] transition-all placeholder:text-[color:var(--nodu-text-soft)] focus:border-[color:var(--nodu-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--nodu-accent-soft)]"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="nodu-sidebar-divider p-3">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="nodu-sidebar-control flex w-full items-center justify-center rounded-xl border border-[color:var(--nodu-border)] py-2.5 text-[color:var(--nodu-text-soft)] transition-colors hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
            title="Rozbalit a hledat"
          >
            <Search size={16} />
          </button>
        </div>
      )}

      <div className="nodu-sidebar-divider p-3">
        {!sidebarCollapsed ? (
          <>
            <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-[color:var(--nodu-text-soft)]">
              {isAuthRequired ? 'Prihlasena role' : 'Zobrazuji jako'}
            </div>
            {isAuthRequired ? (
              <div className="nodu-sidebar-surface rounded-xl border border-[color:var(--nodu-border)] px-3 py-2 text-[11px] font-semibold text-[color:var(--nodu-accent)]">
                {ROLE_LABELS[effectiveRole]}
              </div>
            ) : (
              <div className="nodu-sidebar-surface grid grid-cols-3 gap-1 rounded-xl border border-[color:var(--nodu-border)] p-1">
                {(['crew', 'crewhead', 'coo'] as const).map((roleOption) => (
                  <button
                    key={roleOption}
                    onClick={() => setRole(roleOption)}
                    className={`rounded-lg py-1.5 text-[11px] font-medium transition-all ${role === roleOption ? 'nodu-role-toggle-active border' : 'border border-transparent text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
                  >
                    {ROLE_SHORT_LABELS[roleOption]}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          isAuthRequired ? (
            <div className="nodu-sidebar-surface flex items-center justify-center rounded-xl border border-[color:var(--nodu-border)] px-2 py-2 text-[11px] font-semibold text-[color:var(--nodu-accent)]">
              {ROLE_SHORT_LABELS[effectiveRole]}
            </div>
          ) : (
            <div className="space-y-2">
              {(['crew', 'crewhead', 'coo'] as const).map((roleOption) => (
                <button
                  key={roleOption}
                  onClick={() => setRole(roleOption)}
                  className={`flex w-full items-center justify-center rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all ${role === roleOption ? 'nodu-role-toggle-active' : 'nodu-sidebar-surface border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
                  title={ROLE_LABELS[roleOption]}
                >
                  {ROLE_SHORT_LABELS[roleOption]}
                </button>
              ))}
            </div>
          )
        )}
      </div>

      <div className="relative flex-1 min-h-0">
        {showScrollHintTop && (
          <div className="pointer-events-none absolute inset-x-0 top-1 z-10 flex justify-center">
            <div className="nodu-sidebar-scroll-indicator nodu-sidebar-scroll-indicator-top">
              <ChevronUp size={14} />
            </div>
          </div>
        )}
        <nav ref={navRef} className="nodu-sidebar-scroll h-full space-y-1 overflow-y-auto p-2">
          {navItems.map((item) => {
            const badge = badgeCounts[item.id] || 0;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`${navButtonBaseClass} ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} ${isActive ? navButtonActiveClass : navButtonIdleClass}`}
                title={item.label}
              >
                <item.icon size={16} />
                {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                {badge > 0 && (
                  <span className={`nodu-nav-badge rounded-full px-1.5 py-0.5 text-[10px] font-bold ${sidebarCollapsed ? 'absolute right-1 top-1' : ''}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {showScrollHintBottom && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 z-10 flex justify-center">
            <div className="nodu-sidebar-scroll-indicator nodu-sidebar-scroll-indicator-bottom">
              <ChevronDown size={14} />
            </div>
          </div>
        )}
      </div>

      <div className="nodu-sidebar-divider p-2">
        <button
          onClick={() => openSettings('menu')}
          className={`${navButtonBaseClass} ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} ${currentTab === 'settings' ? navButtonActiveClass : navButtonIdleClass}`}
          title="Nastaveni"
        >
          <Settings size={16} />
          {!sidebarCollapsed && <span className="flex-1 text-left">Nastaveni</span>}
        </button>
      </div>

      <button
        onClick={() => openSettings('profile')}
        className={`nodu-sidebar-divider nodu-sidebar-hover-surface p-4 text-left transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
        title="Profil"
      >
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="nodu-sidebar-avatar av h-9 w-9 border border-[color:var(--nodu-border)] text-[10px] text-[color:var(--nodu-accent)]">
            {profileName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'PH'}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-[color:var(--nodu-text)]">{profileName}</div>
              <div className="text-[10px] text-[color:var(--nodu-text-soft)]">{ROLE_LABELS[effectiveRole]}</div>
            </div>
          )}
        </div>
        {!sidebarCollapsed && (
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[color:var(--nodu-text-soft)]">
            <div className="h-1.5 w-1.5 rounded-full bg-[color:var(--nodu-accent)]"></div>
            {profile?.email || 'API ready · v2.0'}
          </div>
        )}
      </button>

      {isAuthRequired && (
        <div className="nodu-sidebar-divider p-2">
          <button
            onClick={handleSignOut}
            className={`${navButtonBaseClass} ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} ${navButtonIdleClass}`}
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
