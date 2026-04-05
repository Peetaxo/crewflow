import React, { useMemo } from 'react';
import { ArrowLeft, Clock, MapPin, Receipt, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, formatCurrency } from '../utils';
import { KM_RATE } from '../data';
import { PHASE_CONFIG } from '../constants';
import StatusBadge from '../components/shared/StatusBadge';

/** Statistiky projektu */
const ProjectStatsView = () => {
  const {
    selectedProjectIdForStats, setSelectedProjectIdForStats,
    projects, events, timelogs, invoices,
    findContractor, darkMode,
  } = useAppContext();

  const project = projects.find(p => p.id === selectedProjectIdForStats);
  if (!project) return null;

  const projectEvents = events.filter(e => e.job === project.id);
  const projectTimelogs = timelogs.filter(t => projectEvents.some(e => e.id === t.eid));
  const projectInvoices = invoices.filter(i => i.job === project.id);

  const totalHours = projectTimelogs.reduce((sum, t) => sum + calculateTotalHours(t.days), 0);
  const totalKm = projectTimelogs.reduce((sum, t) => sum + t.km, 0);
  const totalCost = projectInvoices.reduce((sum, i) => sum + i.total, 0);
  const crewIds = [...new Set(projectTimelogs.map(t => t.cid))];

  /* Koláčový graf — Rozdělení nákladů dle fáze (Instalace, Provoz, Deinstalace) */
  const costByPhase = useMemo(() => {
    const phaseMap: Record<string, number> = {};
    projectTimelogs.forEach(t => {
      const c = findContractor(t.cid);
      if (!c) return;
      t.days.forEach(d => {
        const phaseName = d.type || 'provoz';
        const hours = (() => {
          const [fh, fm] = d.f.split(':').map(Number);
          const [th, tm] = d.t.split(':').map(Number);
          return (th + tm / 60) - (fh + fm / 60);
        })();
        const cost = hours * c.rate;
        phaseMap[phaseName] = (phaseMap[phaseName] || 0) + cost;
      });
    });

    const phaseColors: Record<string, string> = { instal: '#3b82f6', provoz: '#10b981', deinstal: '#f59e0b' };
    const phaseLabels: Record<string, string> = { instal: 'Instalace', provoz: 'Provoz', deinstal: 'Deinstalace' };

    return Object.entries(phaseMap).map(([type, value]) => ({
      name: phaseLabels[type] || type,
      value: Math.round(value),
      color: phaseColors[type] || '#6b7280',
    }));
  }, [projectTimelogs, findContractor]);

  /* Proplacené hodiny dle fáze */
  const hoursByPhase = useMemo(() => {
    const phaseMap: Record<string, number> = {};
    projectTimelogs.forEach(t => {
      t.days.forEach(d => {
        const phaseName = d.type || 'provoz';
        const [fh, fm] = d.f.split(':').map(Number);
        const [th, tm] = d.t.split(':').map(Number);
        const hours = (th + tm / 60) - (fh + fm / 60);
        phaseMap[phaseName] = (phaseMap[phaseName] || 0) + hours;
      });
    });

    const phaseLabels: Record<string, string> = { instal: 'Instalace', provoz: 'Provoz', deinstal: 'Deinstalace' };
    const phaseColors: Record<string, string> = { instal: '#3b82f6', provoz: '#10b981', deinstal: '#f59e0b' };

    return Object.entries(phaseMap).map(([type, hours]) => ({
      name: phaseLabels[type] || type,
      hours: Math.round(hours * 10) / 10,
      color: phaseColors[type] || '#6b7280',
    }));
  }, [projectTimelogs]);

  /* Schválené faktury */
  const approvedInvoices = projectInvoices.filter(i => i.status === 'paid' || i.status === 'sent');

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button onClick={() => setSelectedProjectIdForStats(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        <ArrowLeft size={14} /> Zpět na Projekty
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{project.id}</div>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{project.name}</h1>
            <p className="text-sm text-gray-500">{project.client}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <Receipt size={14} className="text-emerald-600" />
              <span className="text-[9px] font-bold text-emerald-700 uppercase">Náklady Crew</span>
            </div>
            <div className="text-lg font-bold text-emerald-900">{formatCurrency(totalCost)}</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-blue-600" />
              <span className="text-[9px] font-bold text-blue-700 uppercase">Hodiny</span>
            </div>
            <div className="text-lg font-bold text-blue-900">{totalHours.toFixed(1)}h</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className="text-amber-600" />
              <span className="text-[9px] font-bold text-amber-700 uppercase">Kilometry</span>
            </div>
            <div className="text-lg font-bold text-amber-900">{totalKm} km</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-gray-600" />
              <span className="text-[9px] font-bold text-gray-700 uppercase">Crew</span>
            </div>
            <div className="text-lg font-bold text-gray-900">{crewIds.length} osob</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Koláčový graf — Rozdělení nákladů dle fáze */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">Rozdělení nákladů</h3>
            {costByPhase.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costByPhase} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                      {costByPhase.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatCurrency(v), 'Náklady']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400 text-xs">Žádná data</div>
            )}
          </div>

          {/* Proplacené hodiny dle fáze */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">Proplacené hodiny</h3>
            {hoursByPhase.length > 0 ? (
              <div className="space-y-4">
                {hoursByPhase.map(phase => (
                  <div key={phase.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{phase.name}</span>
                      <span className="font-bold text-gray-900">{phase.hours}h</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (phase.hours / Math.max(...hoursByPhase.map(p => p.hours), 1)) * 100)}%`, backgroundColor: phase.color }} />
                    </div>
                  </div>
                ))}
                <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between text-sm">
                  <span className="font-bold text-gray-700">Celkem</span>
                  <span className="font-black text-gray-900">{hoursByPhase.reduce((s, p) => s + p.hours, 0).toFixed(1)}h</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400 text-xs">Žádná data</div>
            )}
          </div>
        </div>

        {/* Schválené faktury */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">Schválené faktury</h3>
          {approvedInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-200">
                    <th className="px-4 py-3 font-medium">Číslo faktury</th>
                    <th className="px-4 py-3 font-medium">Crew</th>
                    <th className="px-4 py-3 font-medium">Hodiny</th>
                    <th className="px-4 py-3 font-medium">Km</th>
                    <th className="px-4 py-3 font-medium text-right">Částka</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {approvedInvoices.map(inv => {
                    const c = findContractor(inv.cid);
                    return (
                      <tr key={inv.id} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono font-medium text-gray-900">{inv.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {c && <div className="av w-6 h-6 text-[8px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>}
                            <span className="text-xs font-medium">{c?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold">{inv.hours}h</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{inv.km} km</td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-gray-900">{formatCurrency(inv.total)}</td>
                        <td className="px-4 py-3 text-right"><StatusBadge status={inv.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400 text-xs">Žádné schválené faktury</div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectStatsView;
