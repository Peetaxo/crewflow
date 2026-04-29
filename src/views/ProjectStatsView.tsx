import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, ChevronDown, ChevronRight, Clock, MapPin, PackagePlus, Receipt, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { useAppContext } from '../context/useAppContext';
import { BudgetItem, Contractor, Invoice, ReceiptItem, Timelog } from '../types';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import { getTimelogDependencies, getTimelogs, subscribeToTimelogChanges } from '../features/timelogs/services/timelogs.service';
import { getReceipts, subscribeToReceiptChanges } from '../features/receipts/services/receipts.service';
import { getProjectById, getProjectDependencies, subscribeToProjectChanges } from '../features/projects/services/projects.service';
import {
  deleteBudgetItem,
  getBudgetDependencies,
  getProjectBudgetOverview,
  saveBudgetItem,
  saveBudgetPackage,
  subscribeToBudgetChanges,
} from '../features/budgets/services/budgets.service';
import type { ProjectBudgetOverview } from '../features/budgets/services/budgets.service';

type BudgetItemDraftForm = {
  id?: number;
  eventId: string;
  section: string;
  name: string;
  units: string;
  amount: string;
  quantity: string;
  unitPrice: string;
  note: string;
};

const createBudgetItemDraft = (): BudgetItemDraftForm => ({
  eventId: '',
  section: '',
  name: '',
  units: '',
  amount: '',
  quantity: '',
  unitPrice: '',
  note: '',
});

const formatBudgetCurrency = (amount: number): string => (
  formatCurrency(amount).replace(/\u00a0/g, ' ').replace(/Kc$/, 'Kč')
);

const ProjectStatsView = () => {
  const { selectedProjectIdForStats, setSelectedProjectIdForStats } = useAppContext();

  const [project, setProject] = useState(() => getProjectById(selectedProjectIdForStats));
  const [events, setEvents] = useState<ReturnType<typeof getProjectDependencies>['events']>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [timelogs, setTimelogs] = useState<Timelog[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [budgetOverview, setBudgetOverview] = useState<ProjectBudgetOverview | null>(() => (
    selectedProjectIdForStats ? getProjectBudgetOverview(selectedProjectIdForStats) : null
  ));
  const [budgetEvents, setBudgetEvents] = useState<ReturnType<typeof getBudgetDependencies>['events']>([]);
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackageEventIds, setNewPackageEventIds] = useState<number[]>([]);
  const [draftItemsByPackage, setDraftItemsByPackage] = useState<Record<number, BudgetItemDraftForm>>({});
  const [isTimelogsOpen, setIsTimelogsOpen] = useState(true);
  const [isReceiptsOpen, setIsReceiptsOpen] = useState(false);
  const [isInvoicesOpen, setIsInvoicesOpen] = useState(false);

  const loadData = useCallback(() => {
    setProject(getProjectById(selectedProjectIdForStats));
    const dependencies = getProjectDependencies();
    setEvents(dependencies.events);
    setInvoices(dependencies.invoices);
    setTimelogs(getTimelogs());
    setReceipts(getReceipts());
    setContractors(getTimelogDependencies().contractors);
    const budgetDependencies = getBudgetDependencies();
    setBudgetEvents(budgetDependencies.events);
    setBudgetOverview(selectedProjectIdForStats ? getProjectBudgetOverview(selectedProjectIdForStats) : null);
  }, [selectedProjectIdForStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToProjectChanges(loadData), [loadData]);
  useEffect(() => subscribeToTimelogChanges(loadData), [loadData]);
  useEffect(() => subscribeToReceiptChanges(loadData), [loadData]);
  useEffect(() => subscribeToBudgetChanges(loadData), [loadData]);

  const findContractor = useCallback((contractorProfileId?: string) => (
    contractorProfileId
      ? contractors.find((contractor) => contractor.profileId === contractorProfileId) ?? null
      : null
  ), [contractors]);
  const projectId = project?.id ?? null;
  const projectEvents = useMemo(
    () => (projectId ? events.filter((event) => event.job === projectId) : []),
    [events, projectId],
  );
  const projectTimelogs = useMemo(
    () => (projectId ? timelogs.filter((timelog) => projectEvents.some((event) => event.id === timelog.eid)) : []),
    [projectEvents, projectId, timelogs],
  );
  const projectInvoices = useMemo(
    () => (projectId ? invoices.filter((invoice) => invoice.job === projectId) : []),
    [invoices, projectId],
  );
  const projectReceipts = useMemo(
    () => (projectId ? receipts.filter((receipt) => receipt.job === projectId) : []),
    [receipts, projectId],
  );

  const getTimelogCrewCost = useCallback((timelog: Timelog): number => {
    const contractor = findContractor(timelog.contractorProfileId);
    return contractor ? calculateTotalHours(timelog.days) * contractor.rate : 0;
  }, [findContractor]);

  const totalHours = projectTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
  const totalKm = projectTimelogs.reduce((sum, timelog) => sum + timelog.km, 0);
  const totalCrewCost = projectTimelogs.reduce((sum, timelog) => sum + getTimelogCrewCost(timelog), 0);
  const totalReceiptCost = projectReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const crewIds = [...new Set(projectTimelogs.map((timelog) => timelog.contractorProfileId).filter(Boolean))];

  const costByPhase = useMemo(() => {
    const phaseMap: Record<string, number> = {};

    projectTimelogs.forEach((timelog) => {
      const contractor = findContractor(timelog.contractorProfileId);
      if (!contractor) return;

      timelog.days.forEach((day) => {
        const hours = calculateDayHours(day.f, day.t);
        phaseMap[day.type || 'provoz'] = (phaseMap[day.type || 'provoz'] || 0) + (hours * contractor.rate);
      });
    });

    const phaseColors: Record<string, string> = {
      instal: 'var(--nodu-info-text)',
      provoz: 'var(--nodu-success-text)',
      deinstal: 'var(--nodu-warning-text)',
    };
    const phaseLabels: Record<string, string> = { instal: 'Instal', provoz: 'Provoz', deinstal: 'Deinstal' };

    return Object.entries(phaseMap).map(([type, value]) => ({
      name: phaseLabels[type] || type,
      value: Math.round(value),
      color: phaseColors[type] || 'var(--nodu-text-soft)',
    }));
  }, [projectTimelogs, findContractor]);

  const hoursByPhase = useMemo(() => {
    const phaseMap: Record<string, number> = {};

    projectTimelogs.forEach((timelog) => {
      timelog.days.forEach((day) => {
        const hours = calculateDayHours(day.f, day.t);
        phaseMap[day.type || 'provoz'] = (phaseMap[day.type || 'provoz'] || 0) + hours;
      });
    });

    const phaseLabels: Record<string, string> = { instal: 'Instal', provoz: 'Provoz', deinstal: 'Deinstal' };
    const phaseColors: Record<string, string> = {
      instal: 'var(--nodu-info-text)',
      provoz: 'var(--nodu-success-text)',
      deinstal: 'var(--nodu-warning-text)',
    };

    return Object.entries(phaseMap).map(([type, hours]) => ({
      name: phaseLabels[type] || type,
      hours: Math.round(hours * 10) / 10,
      color: phaseColors[type] || 'var(--nodu-text-soft)',
    }));
  }, [projectTimelogs]);

  const approvedInvoices = projectInvoices.filter((invoice) => invoice.status === 'paid' || invoice.status === 'sent');
  const budgetPackages = budgetOverview?.packages ?? [];
  const linkedBudgetEventCount = new Set(budgetPackages.flatMap((budgetPackage) => budgetPackage.eventIds)).size;
  const budgetProjectEvents = useMemo(
    () => (projectId ? budgetEvents.filter((event) => event.job === projectId) : []),
    [budgetEvents, projectId],
  );

  const updateDraftItem = (budgetPackageId: number, field: keyof BudgetItemDraftForm, value: string) => {
    setDraftItemsByPackage((current) => ({
      ...current,
      [budgetPackageId]: {
        ...(current[budgetPackageId] ?? createBudgetItemDraft()),
        [field]: value,
      },
    }));
  };

  const getDraftItem = (budgetPackageId: number): BudgetItemDraftForm => (
    draftItemsByPackage[budgetPackageId] ?? createBudgetItemDraft()
  );

  const handleEditItem = (budgetPackageId: number, item: BudgetItem) => {
    setDraftItemsByPackage((current) => ({
      ...current,
      [budgetPackageId]: {
        id: item.id,
        eventId: item.eventId ? String(item.eventId) : '',
        section: item.section,
        name: item.name,
        units: item.units,
        amount: String(item.amount),
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        note: item.note,
      },
    }));
  };

  const handlePackageEventToggle = (eventId: number) => {
    setNewPackageEventIds((current) => (
      current.includes(eventId)
        ? current.filter((item) => item !== eventId)
        : [...current, eventId]
    ));
  };

  const handleSavePackage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !newPackageName.trim()) return;

    try {
      await saveBudgetPackage({
        projectId,
        name: newPackageName.trim(),
        note: '',
        eventIds: newPackageEventIds,
      });
      setNewPackageName('');
      setNewPackageEventIds([]);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit rozpocet.');
    }
  };

  const handleSaveItem = async (event: React.FormEvent<HTMLFormElement>, budgetPackageId: number) => {
    event.preventDefault();
    if (!projectId) return;

    const draft = getDraftItem(budgetPackageId);
    if (!draft.section.trim() || !draft.name.trim()) return;

    try {
      await saveBudgetItem({
        id: draft.id,
        projectId,
        budgetPackageId,
        eventId: draft.eventId ? Number(draft.eventId) : null,
        section: draft.section.trim(),
        name: draft.name.trim(),
        units: draft.units.trim(),
        amount: Number(draft.amount) || 0,
        quantity: Number(draft.quantity) || 0,
        unitPrice: Number(draft.unitPrice) || 0,
        note: draft.note,
      });
      setDraftItemsByPackage((current) => ({
        ...current,
        [budgetPackageId]: createBudgetItemDraft(),
      }));
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit rozpocet.');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await deleteBudgetItem(itemId);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se smazat polozku.');
    }
  };

  const renderToggle = (open: boolean) => (
    open ? <ChevronDown size={16} className="text-[var(--nodu-text-soft)]" /> : <ChevronRight size={16} className="text-[var(--nodu-text-soft)]" />
  );

  const renderCostLabel = ({
    cx,
    cy,
    midAngle,
    outerRadius,
    percent,
    value,
    name,
    index,
  }: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    outerRadius?: number;
    percent?: number;
    value?: number;
    name?: string;
    index?: number;
  }) => {
    if (!cx || !cy || !outerRadius || midAngle === undefined || !percent || !value || !name || percent < 0.08) return null;

    const RADIAN = Math.PI / 180;
    const sin = Math.sin(-midAngle * RADIAN);
    const cos = Math.cos(-midAngle * RADIAN);
    const startX = cx + (outerRadius - 2) * cos;
    const startY = cy + (outerRadius - 2) * sin;
    const elbowX = cx + (outerRadius + 14) * cos;
    const elbowY = cy + (outerRadius + 14) * sin;
    const isRightSide = cos >= 0;
    const endX = elbowX + (isRightSide ? 28 : -28);
    const textAnchor = isRightSide ? 'start' : 'end';
    const color = costByPhase[index ?? 0]?.color ?? 'var(--nodu-text)';

    return (
      <g>
        <path d={`M ${startX} ${startY} L ${elbowX} ${elbowY} L ${endX} ${elbowY}`} stroke={color} strokeWidth={1.5} fill="none" />
        <circle cx={endX} cy={elbowY} r={2.5} fill={color} />
        <text x={endX + (isRightSide ? 8 : -8)} y={elbowY - 7} fill={color} textAnchor={textAnchor} fontSize={11} fontWeight={700}>
          {name}
        </text>
        <text x={endX + (isRightSide ? 8 : -8)} y={elbowY + 9} fill="var(--nodu-text)" textAnchor={textAnchor} fontSize={11} fontWeight={700}>
          {formatCurrency(value)}
        </text>
      </g>
    );
  };

  if (!project) return null;

  const statCards = [
    { label: 'Naklady Crew', value: formatCurrency(totalCrewCost), icon: Receipt, tone: 'success' },
    { label: 'Uctenky', value: formatCurrency(totalReceiptCost), icon: Receipt, tone: 'warning' },
    { label: 'Hodiny', value: `${totalHours.toFixed(1)}h`, icon: Clock, tone: 'info' },
    { label: 'Kilometry', value: `${totalKm} km`, icon: MapPin, tone: 'accent' },
    { label: 'Crew', value: `${crewIds.length} osob`, icon: Users, tone: 'neutral' },
  ] as const;

  const getToneClasses = (tone: typeof statCards[number]['tone']) => {
    if (tone === 'success') return 'bg-[var(--nodu-success-bg)] text-[var(--nodu-success-text)]';
    if (tone === 'info') return 'bg-[var(--nodu-info-bg)] text-[var(--nodu-info-text)]';
    if (tone === 'warning') return 'bg-[var(--nodu-warning-bg)] text-[var(--nodu-warning-text)]';
    if (tone === 'accent') return 'bg-[var(--nodu-accent-soft)] text-[var(--nodu-accent)]';
    return 'bg-[rgba(var(--nodu-text-rgb),0.06)] text-[var(--nodu-text-soft)]';
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedProjectIdForStats(null)} className="mb-4 flex items-center gap-1 text-xs font-medium text-[var(--nodu-text-soft)] transition-colors hover:text-[var(--nodu-accent)]">
        <ArrowLeft size={14} /> Zpet na Projekty
      </button>

      <div className="mb-6 rounded-[28px] border border-[var(--nodu-border)] bg-white p-6 shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--nodu-accent)]">{project.id}</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--nodu-text)]">{project.name}</h1>
            <p className="text-sm text-[var(--nodu-text-soft)]">{project.client}</p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          {statCards.map((item) => (
            <div key={item.label} className="rounded-[22px] border border-[var(--nodu-border)] bg-white p-4 shadow-[0_14px_30px_rgba(var(--nodu-text-rgb),0.05)]">
              <div className="mb-2 flex items-center gap-2">
                <div className={`rounded-xl p-2 ${getToneClasses(item.tone)}`}>
                  <item.icon size={14} />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">{item.label}</span>
              </div>
              <div className="text-lg font-bold text-[var(--nodu-text)]">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-[var(--nodu-accent-soft)] p-2 text-[var(--nodu-accent)]">
                <Calculator size={15} />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Rozpocet</h2>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Planovany rozpocet', value: formatBudgetCurrency(budgetOverview?.plannedTotal ?? 0) },
              { label: 'Skutecne naklady', value: formatBudgetCurrency(budgetOverview?.actualTotal ?? 0) },
              { label: 'Variance', value: formatBudgetCurrency(budgetOverview?.variance ?? 0) },
              { label: 'Baliky / akce', value: `${budgetPackages.length} / ${linkedBudgetEventCount}` },
            ].map((item) => (
              <div key={item.label} className="rounded-[18px] border border-[var(--nodu-border)] bg-white p-3 shadow-[0_10px_22px_rgba(var(--nodu-text-rgb),0.04)]">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">{item.label}</div>
                <div className="mt-1 text-base font-bold text-[var(--nodu-text)]">{item.value}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSavePackage} className="mb-4 rounded-[18px] border border-[var(--nodu-border)] bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_auto] lg:items-end">
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">
                Nazev baliku
                <input
                  value={newPackageName}
                  onChange={(event) => setNewPackageName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] px-3 py-2 text-xs font-semibold text-[var(--nodu-text)] outline-none transition-colors focus:border-[var(--nodu-accent)]"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {budgetProjectEvents.map((event) => (
                  <label key={event.id} className="inline-flex items-center gap-2 rounded-xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] px-3 py-2 text-xs font-medium text-[var(--nodu-text)]">
                    <input
                      type="checkbox"
                      aria-label={event.name}
                      checked={newPackageEventIds.includes(event.id)}
                      onChange={() => handlePackageEventToggle(event.id)}
                      className="h-3.5 w-3.5 accent-[var(--nodu-accent)]"
                    />
                    {event.name}
                  </label>
                ))}
              </div>

              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--nodu-accent)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90">
                <PackagePlus size={14} /> Pridat balik
              </button>
            </div>
          </form>

          {budgetPackages.length > 0 ? (
            <div className="space-y-3">
              {budgetPackages.map((budgetPackage) => {
                const draftItem = getDraftItem(budgetPackage.id);

                return (
                  <div key={budgetPackage.id} data-testid={`budget-package-${budgetPackage.id}`} className="rounded-[20px] border border-[var(--nodu-border)] bg-white p-4 shadow-[0_12px_26px_rgba(var(--nodu-text-rgb),0.04)]">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--nodu-text)]">{budgetPackage.name}</h3>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {budgetPackage.linkedEvents.length > 0 ? budgetPackage.linkedEvents.map((event) => (
                            <span key={event.id} className="rounded-full bg-[var(--nodu-accent-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--nodu-accent)]">{event.name}</span>
                          )) : (
                            <span className="text-[10px] text-[var(--nodu-text-soft)]">Bez pripojenych akci</span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-right text-xs">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Plan</div>
                          <div className="font-bold text-[var(--nodu-text)]">{formatBudgetCurrency(budgetPackage.plannedTotal)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Skutecne</div>
                          <div className="font-bold text-[var(--nodu-text)]">{formatBudgetCurrency(budgetPackage.actualTotal)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Variance</div>
                          <div className="font-bold text-[var(--nodu-text)]">{formatBudgetCurrency(budgetPackage.variance)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3 overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[var(--nodu-border)] text-[10px] uppercase tracking-wider text-[var(--nodu-text-soft)]">
                            <th className="px-3 py-2 font-medium">Sekce</th>
                            <th className="px-3 py-2 font-medium">Polozka</th>
                            <th className="px-3 py-2 font-medium">Akce</th>
                            <th className="px-3 py-2 font-medium">Jednotky</th>
                            <th className="px-3 py-2 font-medium text-right">Pocet</th>
                            <th className="px-3 py-2 font-medium text-right">Mnozstvi</th>
                            <th className="px-3 py-2 font-medium text-right">Cena za jednotku</th>
                            <th className="px-3 py-2 font-medium text-right">Celkem</th>
                            <th className="px-3 py-2 font-medium text-right">Akce</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgba(var(--nodu-text-rgb),0.06)]">
                          {budgetPackage.items.map((item) => {
                            const linkedEvent = budgetPackage.linkedEvents.find((event) => event.id === item.eventId);

                            return (
                              <tr key={item.id} className="text-xs">
                                <td className="px-3 py-2 font-semibold text-[var(--nodu-text)]">{item.section}</td>
                                <td className="px-3 py-2 text-[var(--nodu-text)]">{item.name}</td>
                                <td className="px-3 py-2 text-[var(--nodu-text-soft)]">{linkedEvent?.name ?? '-'}</td>
                                <td className="px-3 py-2 text-[var(--nodu-text-soft)]">{item.units}</td>
                                <td className="px-3 py-2 text-right text-[var(--nodu-text)]">{item.amount}</td>
                                <td className="px-3 py-2 text-right text-[var(--nodu-text)]">{item.quantity}</td>
                                <td className="px-3 py-2 text-right text-[var(--nodu-text)]">{formatBudgetCurrency(item.unitPrice)}</td>
                                <td className="px-3 py-2 text-right font-bold text-[var(--nodu-text)]">{formatBudgetCurrency(item.amount * item.quantity * item.unitPrice)}</td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleEditItem(budgetPackage.id, item)}
                                      className="rounded-lg border border-[var(--nodu-border)] px-2 py-1 text-[10px] font-bold text-[var(--nodu-text)] transition-colors hover:border-[var(--nodu-accent)] hover:text-[var(--nodu-accent)]"
                                    >
                                      Upravit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteItem(item.id)}
                                      className="rounded-lg border border-[var(--nodu-border)] px-2 py-1 text-[10px] font-bold text-[var(--nodu-danger-text)] transition-colors hover:border-[var(--nodu-danger-text)]"
                                    >
                                      Smazat
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <form onSubmit={(event) => handleSaveItem(event, budgetPackage.id)} className="grid gap-2 border-t border-[rgba(var(--nodu-text-rgb),0.06)] pt-3 md:grid-cols-8">
                      <label className="min-w-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">
                        Akce polozky
                        <select
                          aria-label="Akce polozky"
                          value={draftItem.eventId}
                          onChange={(event) => updateDraftItem(budgetPackage.id, 'eventId', event.target.value)}
                          className="mt-1 w-full min-w-0 rounded-xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] px-3 py-2 text-xs font-medium normal-case tracking-normal text-[var(--nodu-text)] outline-none transition-colors focus:border-[var(--nodu-accent)]"
                        >
                          <option value="">Balik</option>
                          {budgetPackage.linkedEvents.map((event) => (
                            <option key={event.id} value={event.id}>{event.name}</option>
                          ))}
                        </select>
                      </label>
                      {[
                        { label: 'Sekce', field: 'section', type: 'text' },
                        { label: 'Polozka', field: 'name', type: 'text' },
                        { label: 'Jednotky', field: 'units', type: 'text' },
                        { label: 'Pocet', field: 'amount', type: 'number' },
                        { label: 'Mnozstvi', field: 'quantity', type: 'number' },
                        { label: 'Cena za jednotku', field: 'unitPrice', type: 'number' },
                      ].map((field) => (
                        <label key={field.field} className="min-w-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">
                          {field.label}
                          <input
                            aria-label={field.label}
                            type={field.type}
                            value={draftItem[field.field as keyof BudgetItemDraftForm]}
                            onChange={(event) => updateDraftItem(budgetPackage.id, field.field as keyof BudgetItemDraftForm, event.target.value)}
                            className="mt-1 w-full min-w-0 rounded-xl border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] px-3 py-2 text-xs font-medium normal-case tracking-normal text-[var(--nodu-text)] outline-none transition-colors focus:border-[var(--nodu-accent)]"
                          />
                        </label>
                      ))}
                      <button type="submit" className="rounded-xl bg-[var(--nodu-text)] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90">
                        {draftItem.id ? 'Ulozit polozku' : 'Pridat polozku'}
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--nodu-border)] bg-white py-8 text-center text-xs text-[var(--nodu-text-soft)]">
              Zatim nejsou zadane zadne rozpoctove baliky.
            </div>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Rozdeleni nakladu</h3>
            {costByPhase.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 10, right: 50, bottom: 10, left: 50 }}>
                    <Pie
                      data={costByPhase}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={72}
                      label={renderCostLabel}
                      labelLine={false}
                    >
                      {costByPhase.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Naklady']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-[var(--nodu-text-soft)]">Zadna data</div>
            )}
          </div>

          <div className="rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Proplacene hodiny</h3>
            {hoursByPhase.length > 0 ? (
              <div className="space-y-4">
                {hoursByPhase.map((phase) => (
                  <div key={phase.name}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-[var(--nodu-text)]">{phase.name}</span>
                      <span className="font-bold text-[var(--nodu-text)]">{phase.hours}h</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[rgba(var(--nodu-text-rgb),0.08)]">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (phase.hours / Math.max(...hoursByPhase.map((item) => item.hours), 1)) * 100)}%`, backgroundColor: phase.color }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-[var(--nodu-text-soft)]">Zadna data</div>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
          <button onClick={() => setIsTimelogsOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Timelogy projektu</h3>
            {renderToggle(isTimelogsOpen)}
          </button>
          {isTimelogsOpen && (
            projectTimelogs.length > 0 ? (
              <div className="mt-4 space-y-3">
                {projectTimelogs.map((timelog) => {
                  const contractor = findContractor(timelog.contractorProfileId);
                  const event = projectEvents.find((item) => item.id === timelog.eid);
                  if (!contractor || !event) return null;

                  const totalTimelogHours = calculateTotalHours(timelog.days);
                  const phases = Array.from(new Set(timelog.days.map((day) => day.type)));

                  return (
                    <div key={timelog.id} className="rounded-[22px] border border-[var(--nodu-border)] bg-white p-5 shadow-[0_14px_30px_rgba(var(--nodu-text-rgb),0.05)]">
                      <div className="mb-3 flex items-center gap-3 border-b border-[rgba(var(--nodu-text-rgb),0.06)] pb-3">
                        <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                          {contractor.ii}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-[var(--nodu-text)]">{contractor.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="jn">{event.job}</span>
                            <span className="text-xs text-[var(--nodu-text-soft)]">{event.name}</span>
                            {phases.map((phase) => (
                              <StatusBadge key={`${timelog.id}-${phase}`} status={phase} />
                            ))}
                          </div>
                        </div>
                        <StatusBadge status={timelog.status} />
                        <div className="text-right">
                          <div className="text-base font-semibold text-[var(--nodu-text)]">{totalTimelogHours.toFixed(1)}h</div>
                          <div className="text-[10px] text-[var(--nodu-text-soft)]">
                            {timelog.km > 0 ? `${timelog.km} km` : 'Bez km'}
                          </div>
                        </div>
                      </div>

                      <div className="mb-3">
                        {timelog.days.map((day, index) => (
                          <div key={`${timelog.id}-${index}`} className="flex items-center gap-4 py-1 text-xs">
                            <span className="w-20 text-[var(--nodu-text-soft)]">{formatShortDate(day.d)}</span>
                            <span className="font-mono font-semibold text-[var(--nodu-text)]">{day.f} - {day.t}</span>
                            <StatusBadge status={day.type} />
                            <span className="ml-auto text-[var(--nodu-text-soft)]">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="text-[var(--nodu-text-soft)]">
                          {event.city || 'Bez mesta'}
                        </div>
                        {timelog.note ? (
                          <p className="min-w-0 flex-1 text-right italic text-[var(--nodu-text-soft)]">"{timelog.note}"</p>
                        ) : (
                          <span className="text-[var(--nodu-text-soft)]">Bez poznamky</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--nodu-text-soft)]">K tomuto projektu zatim nejsou zadane zadne timelogy.</div>
            )
          )}
        </div>

        <div className="mb-4 rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
          <button onClick={() => setIsReceiptsOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Uctenky projektu</h3>
            {renderToggle(isReceiptsOpen)}
          </button>
          {isReceiptsOpen && (
            projectReceipts.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--nodu-border)] text-[10px] uppercase tracking-wider text-[var(--nodu-text-soft)]">
                      <th className="px-4 py-3 font-medium">Nazev</th>
                      <th className="px-4 py-3 font-medium">Akce</th>
                      <th className="px-4 py-3 font-medium">Crew</th>
                      <th className="px-4 py-3 font-medium">Datum</th>
                      <th className="px-4 py-3 font-medium text-right">Castka</th>
                      <th className="px-4 py-3 font-medium text-right">Stav</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(var(--nodu-text-rgb),0.06)]">
                    {projectReceipts.map((receipt) => {
                      const contractor = findContractor(receipt.contractorProfileId);
                      const event = projectEvents.find((item) => item.id === receipt.eid);
                      return (
                        <tr key={receipt.id} className="bg-white transition-colors hover:bg-[var(--nodu-accent-soft)]">
                          <td className="px-4 py-3">
                            <div className="text-xs font-semibold text-[var(--nodu-text)]">{receipt.title}</div>
                            <div className="text-[10px] text-[var(--nodu-text-soft)]">{receipt.vendor}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--nodu-text)]">{event?.name || '-'}</td>
                          <td className="px-4 py-3 text-xs text-[var(--nodu-text)]">{contractor?.name || '-'}</td>
                          <td className="px-4 py-3 text-xs text-[var(--nodu-text)]">{receipt.paidAt}</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-[var(--nodu-text)]">{formatCurrency(receipt.amount)}</td>
                          <td className="px-4 py-3 text-right"><StatusBadge status={receipt.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--nodu-text-soft)]">K tomuto projektu zatim nejsou zadane zadne uctenky.</div>
            )
          )}
        </div>

        <div className="rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
          <button onClick={() => setIsInvoicesOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--nodu-text-soft)]">Schvalene faktury</h3>
            {renderToggle(isInvoicesOpen)}
          </button>
          {isInvoicesOpen && (
            approvedInvoices.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--nodu-border)] text-[10px] uppercase tracking-wider text-[var(--nodu-text-soft)]">
                      <th className="px-4 py-3 font-medium">Cislo faktury</th>
                      <th className="px-4 py-3 font-medium">Crew</th>
                      <th className="px-4 py-3 font-medium">Hodiny</th>
                      <th className="px-4 py-3 font-medium">Km</th>
                      <th className="px-4 py-3 font-medium text-right">Castka</th>
                      <th className="px-4 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(var(--nodu-text-rgb),0.06)]">
                    {approvedInvoices.map((invoice) => {
                      const contractor = findContractor(invoice.contractorProfileId);
                      return (
                        <tr key={invoice.id} className="bg-white transition-colors hover:bg-[var(--nodu-accent-soft)]">
                          <td className="px-4 py-3 text-xs font-mono font-medium text-[var(--nodu-text)]">{invoice.id}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {contractor && <div className="av h-6 w-6 text-[8px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>}
                              <span className="text-xs font-medium text-[var(--nodu-text)]">{contractor?.name || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-[var(--nodu-text)]">{invoice.hours}h</td>
                          <td className="px-4 py-3 text-xs text-[var(--nodu-text-soft)]">{invoice.km} km</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-[var(--nodu-text)]">{formatCurrency(invoice.total)}</td>
                          <td className="px-4 py-3 text-right"><StatusBadge status={invoice.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--nodu-text-soft)]">Zadne schvalene faktury</div>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectStatsView;
