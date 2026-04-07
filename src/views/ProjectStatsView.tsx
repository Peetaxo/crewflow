import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Clock, MapPin, Receipt, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useAppContext } from '../context/AppContext';
import { calculateDayHours, calculateTotalHours, formatCurrency, formatShortDate } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';

const ProjectStatsView = () => {
  const {
    selectedProjectIdForStats,
    setSelectedProjectIdForStats,
    projects,
    events,
    timelogs,
    invoices,
    receipts,
    findContractor,
  } = useAppContext();

  const project = projects.find((item) => item.id === selectedProjectIdForStats);
  const [isTimelogsOpen, setIsTimelogsOpen] = useState(true);
  const [isReceiptsOpen, setIsReceiptsOpen] = useState(false);
  const [isInvoicesOpen, setIsInvoicesOpen] = useState(false);

  if (!project) return null;

  const projectEvents = events.filter((event) => event.job === project.id);
  const projectTimelogs = timelogs.filter((timelog) => projectEvents.some((event) => event.id === timelog.eid));
  const projectInvoices = invoices.filter((invoice) => invoice.job === project.id);
  const projectReceipts = receipts.filter((receipt) => receipt.job === project.id);

  const totalHours = projectTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
  const totalKm = projectTimelogs.reduce((sum, timelog) => sum + timelog.km, 0);
  const totalCrewCost = projectInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalReceiptCost = projectReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const crewIds = [...new Set(projectTimelogs.map((timelog) => timelog.cid))];

  const costByPhase = useMemo(() => {
    const phaseMap: Record<string, number> = {};

    projectTimelogs.forEach((timelog) => {
      const contractor = findContractor(timelog.cid);
      if (!contractor) return;

      timelog.days.forEach((day) => {
        const [fh, fm] = day.f.split(':').map(Number);
        const [th, tm] = day.t.split(':').map(Number);
        const hours = (th + tm / 60) - (fh + fm / 60);
        phaseMap[day.type || 'provoz'] = (phaseMap[day.type || 'provoz'] || 0) + (hours * contractor.rate);
      });
    });

    const phaseColors: Record<string, string> = { instal: '#3b82f6', provoz: '#10b981', deinstal: '#f59e0b' };
    const phaseLabels: Record<string, string> = { instal: 'Instal', provoz: 'Provoz', deinstal: 'Deinstal' };

    return Object.entries(phaseMap).map(([type, value]) => ({
      name: phaseLabels[type] || type,
      value: Math.round(value),
      color: phaseColors[type] || '#6b7280',
    }));
  }, [projectTimelogs, findContractor]);

  const hoursByPhase = useMemo(() => {
    const phaseMap: Record<string, number> = {};

    projectTimelogs.forEach((timelog) => {
      timelog.days.forEach((day) => {
        const [fh, fm] = day.f.split(':').map(Number);
        const [th, tm] = day.t.split(':').map(Number);
        const hours = (th + tm / 60) - (fh + fm / 60);
        phaseMap[day.type || 'provoz'] = (phaseMap[day.type || 'provoz'] || 0) + hours;
      });
    });

    const phaseLabels: Record<string, string> = { instal: 'Instal', provoz: 'Provoz', deinstal: 'Deinstal' };
    const phaseColors: Record<string, string> = { instal: '#3b82f6', provoz: '#10b981', deinstal: '#f59e0b' };

    return Object.entries(phaseMap).map(([type, hours]) => ({
      name: phaseLabels[type] || type,
      hours: Math.round(hours * 10) / 10,
      color: phaseColors[type] || '#6b7280',
    }));
  }, [projectTimelogs]);

  const approvedInvoices = projectInvoices.filter((invoice) => invoice.status === 'paid' || invoice.status === 'sent');

  const renderToggle = (open: boolean) => (
    open ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />
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
    const color = costByPhase[index ?? 0]?.color ?? '#374151';

    return (
      <g>
        <path d={`M ${startX} ${startY} L ${elbowX} ${elbowY} L ${endX} ${elbowY}`} stroke={color} strokeWidth={1.5} fill="none" />
        <circle cx={endX} cy={elbowY} r={2.5} fill={color} />
        <text x={endX + (isRightSide ? 8 : -8)} y={elbowY - 7} fill={color} textAnchor={textAnchor} fontSize={11} fontWeight={700}>
          {name}
        </text>
        <text x={endX + (isRightSide ? 8 : -8)} y={elbowY + 9} fill="#374151" textAnchor={textAnchor} fontSize={11} fontWeight={700}>
          {formatCurrency(value)}
        </text>
      </g>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedProjectIdForStats(null)} className="mb-4 flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-900">
        <ArrowLeft size={14} /> Zpet na Projekty
      </button>

      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{project.id}</div>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500">{project.client}</p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Receipt size={14} className="text-emerald-600" />
              <span className="text-[9px] font-bold uppercase text-emerald-700">Naklady Crew (faktury)</span>
            </div>
            <div className="text-lg font-bold text-emerald-900">{formatCurrency(totalCrewCost)}</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Receipt size={14} className="text-amber-600" />
              <span className="text-[9px] font-bold uppercase text-amber-700">Uctenky</span>
            </div>
            <div className="text-lg font-bold text-amber-900">{formatCurrency(totalReceiptCost)}</div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Clock size={14} className="text-blue-600" />
              <span className="text-[9px] font-bold uppercase text-blue-700">Hodiny</span>
            </div>
            <div className="text-lg font-bold text-blue-900">{totalHours.toFixed(1)}h</div>
          </div>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <MapPin size={14} className="text-orange-600" />
              <span className="text-[9px] font-bold uppercase text-orange-700">Kilometry</span>
            </div>
            <div className="text-lg font-bold text-orange-900">{totalKm} km</div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users size={14} className="text-gray-600" />
              <span className="text-[9px] font-bold uppercase text-gray-700">Crew</span>
            </div>
            <div className="text-lg font-bold text-gray-900">{crewIds.length} osob</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-700">Rozdeleni nakladu</h3>
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
              <div className="py-10 text-center text-xs text-gray-400">Zadna data</div>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-700">Proplacene hodiny</h3>
            {hoursByPhase.length > 0 ? (
              <div className="space-y-4">
                {hoursByPhase.map((phase) => (
                  <div key={phase.name}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{phase.name}</span>
                      <span className="font-bold text-gray-900">{phase.hours}h</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (phase.hours / Math.max(...hoursByPhase.map((item) => item.hours), 1)) * 100)}%`, backgroundColor: phase.color }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-gray-400">Zadna data</div>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <button onClick={() => setIsTimelogsOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Timelogy projektu</h3>
            {renderToggle(isTimelogsOpen)}
          </button>
          {isTimelogsOpen && (
            projectTimelogs.length > 0 ? (
              <div className="mt-4 space-y-3">
                {projectTimelogs.map((timelog) => {
                  const contractor = findContractor(timelog.cid);
                  const event = projectEvents.find((item) => item.id === timelog.eid);
                  if (!contractor || !event) return null;

                  const totalTimelogHours = calculateTotalHours(timelog.days);
                  const phases = Array.from(new Set(timelog.days.map((day) => day.type)));

                  return (
                    <div key={timelog.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-center gap-3 border-b border-gray-50 pb-3">
                        <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                          {contractor.ii}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{contractor.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="jn">{event.job}</span>
                            <span className="text-xs text-gray-500">{event.name}</span>
                            {phases.map((phase) => (
                              <StatusBadge key={`${timelog.id}-${phase}`} status={phase} />
                            ))}
                          </div>
                        </div>
                        <StatusBadge status={timelog.status} />
                        <div className="text-right">
                          <div className="text-base font-semibold">{totalTimelogHours.toFixed(1)}h</div>
                          <div className="text-[10px] text-gray-500">
                            {timelog.km > 0 ? `${timelog.km} km` : 'Bez km'}
                          </div>
                        </div>
                      </div>

                      <div className="mb-3">
                        {timelog.days.map((day, index) => (
                          <div key={`${timelog.id}-${index}`} className="flex items-center gap-4 py-1 text-xs">
                            <span className="w-20 text-gray-500">{formatShortDate(day.d)}</span>
                            <span className="font-mono font-semibold">{day.f} - {day.t}</span>
                            <StatusBadge status={day.type} />
                            <span className="ml-auto text-gray-500">{calculateDayHours(day.f, day.t).toFixed(1)}h</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="text-gray-500">
                          {event.city || 'Bez mesta'}
                        </div>
                        {timelog.note ? (
                          <p className="min-w-0 flex-1 text-right italic text-gray-500">"{timelog.note}"</p>
                        ) : (
                          <span className="text-gray-400">Bez poznamky</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">K tomuto projektu zatim nejsou zadane zadne timelogy.</div>
            )
          )}
        </div>

        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <button onClick={() => setIsReceiptsOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Uctenky projektu</h3>
            {renderToggle(isReceiptsOpen)}
          </button>
          {isReceiptsOpen && (
            projectReceipts.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="px-4 py-3 font-medium">Nazev</th>
                      <th className="px-4 py-3 font-medium">Akce</th>
                      <th className="px-4 py-3 font-medium">Crew</th>
                      <th className="px-4 py-3 font-medium">Datum</th>
                      <th className="px-4 py-3 font-medium text-right">Castka</th>
                      <th className="px-4 py-3 font-medium text-right">Stav</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {projectReceipts.map((receipt) => {
                      const contractor = findContractor(receipt.cid);
                      const event = projectEvents.find((item) => item.id === receipt.eid);
                      return (
                        <tr key={receipt.id} className="bg-white transition-colors hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="text-xs font-semibold text-gray-900">{receipt.title}</div>
                            <div className="text-[10px] text-gray-500">{receipt.vendor}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700">{event?.name || '-'}</td>
                          <td className="px-4 py-3 text-xs text-gray-700">{contractor?.name || '-'}</td>
                          <td className="px-4 py-3 text-xs text-gray-700">{receipt.paidAt}</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-gray-900">{formatCurrency(receipt.amount)}</td>
                          <td className="px-4 py-3 text-right"><StatusBadge status={receipt.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">K tomuto projektu zatim nejsou zadane zadne uctenky.</div>
            )
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <button onClick={() => setIsInvoicesOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Schvalene faktury</h3>
            {renderToggle(isInvoicesOpen)}
          </button>
          {isInvoicesOpen && (
            approvedInvoices.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="px-4 py-3 font-medium">Cislo faktury</th>
                      <th className="px-4 py-3 font-medium">Crew</th>
                      <th className="px-4 py-3 font-medium">Hodiny</th>
                      <th className="px-4 py-3 font-medium">Km</th>
                      <th className="px-4 py-3 font-medium text-right">Castka</th>
                      <th className="px-4 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {approvedInvoices.map((invoice) => {
                      const contractor = findContractor(invoice.cid);
                      return (
                        <tr key={invoice.id} className="bg-white transition-colors hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs font-mono font-medium text-gray-900">{invoice.id}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {contractor && <div className="av h-6 w-6 text-[8px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>}
                              <span className="text-xs font-medium">{contractor?.name || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold">{invoice.hours}h</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{invoice.km} km</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-gray-900">{formatCurrency(invoice.total)}</td>
                          <td className="px-4 py-3 text-right"><StatusBadge status={invoice.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">Zadne schvalene faktury</div>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectStatsView;
