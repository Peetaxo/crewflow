import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import type { Invoice } from '../../../types';
import { formatCurrency } from '../../../utils';

export default function CrewBillingChart({ invoices, darkMode }: { invoices: Invoice[]; darkMode: boolean }) {
  const [chartPeriod, setChartPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const chartData = useMemo(() => {
    const data: Record<string, { total: number; date: Date }> = {};

    invoices.forEach((inv) => {
      if (!inv.sentAt) return;
      const date = parseISO(inv.sentAt);
      if (Number.isNaN(date.getTime())) return;
      let key: string;
      let sortDate: Date;

      if (chartPeriod === 'month') {
        key = format(date, 'MMM yyyy', { locale: cs });
        sortDate = new Date(date.getFullYear(), date.getMonth(), 1);
      } else if (chartPeriod === 'quarter') {
        const quarter = Math.floor(date.getMonth() / 3);
        key = `Q${quarter + 1} ${date.getFullYear()}`;
        sortDate = new Date(date.getFullYear(), quarter * 3, 1);
      } else {
        key = format(date, 'yyyy');
        sortDate = new Date(date.getFullYear(), 0, 1);
      }

      if (!data[key]) data[key] = { total: 0, date: sortDate };
      data[key].total += inv.total;
    });

    return Object.entries(data)
      .map(([name, { total, date }]) => ({ name, total, date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [invoices, chartPeriod]);

  return (
      <div className="mb-8 overflow-hidden rounded-[24px] border border-[var(--nodu-border)] bg-white shadow-[0_18px_40px_rgba(var(--nodu-text-rgb),0.06)]">
        <button
          aria-expanded={isChartExpanded}
          onClick={() => setIsChartExpanded(!isChartExpanded)}
          className="flex w-full items-center justify-between px-4 sm:px-6 py-4 transition-colors hover:bg-[var(--nodu-accent-soft)]"
        >
          <div className="flex items-center gap-3">
            <BarChart3 size={18} className="text-[var(--nodu-accent)]" />
            <h2 className="text-sm font-bold  text-[var(--nodu-text)]">Fakturace v čase</h2>
          </div>
          <ChevronDown size={16} className={`text-[var(--nodu-text-soft)] transition-transform duration-300 ${isChartExpanded ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isChartExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 sm:px-6 pb-6 pt-2">
                <div className="mb-6 flex justify-end">
                  <div className="flex gap-1 rounded-xl border border-[var(--nodu-border)] bg-white p-1">
                    {(['month', 'quarter', 'year'] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setChartPeriod(period)}
                        className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${chartPeriod === period ? 'bg-[var(--nodu-accent)] text-white shadow-sm' : 'text-[var(--nodu-text-soft)] hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]'}`}
                      >
                        {period === 'month' ? 'Měsíce' : period === 'quarter' ? 'Čtvrtletí' : 'Roky'}
                      </button>
                    ))}
                  </div>
                </div>

                {chartData.length === 0 ? <p className="py-8 text-center text-sm text-[var(--nodu-text-soft)]">Zatím není vystavená fakturace pro graf.</p> : <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1f2937' : '#f3f4f6'} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v / 1000}k`} />
                      <Tooltip
                        cursor={{ fill: darkMode ? '#111827' : '#f9fafb' }}
                        contentStyle={{
                          backgroundColor: darkMode ? '#111827' : '#fff',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          fontSize: '12px',
                        }}
                        formatter={(v: number) => [formatCurrency(v), 'Fakturováno']}
                      />
                      <Bar dataKey="total" fill="var(--nodu-accent)" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
  );
}
