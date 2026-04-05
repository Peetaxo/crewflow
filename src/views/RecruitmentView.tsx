import React from 'react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import StatusBadge from '../components/shared/StatusBadge';

const RecruitmentView = () => {
  const { candidates, advanceCandidate } = useAppContext();
  const cols = [
    { id: 'new', lbl: 'Nový zájemce', sub: 'Příchozí z Tally.so' },
    { id: 'interview_scheduled', lbl: 'Pohovor naplánován', sub: 'Cal.com booking' },
    { id: 'decision', lbl: 'Rozhodnutí', sub: 'Proběhl pohovor' },
    { id: 'accepted', lbl: 'Přijat / Onboarding', sub: 'Stává se kontraktorem' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-5">
        <div><h1 className="text-lg font-semibold">Nábor</h1><p className="text-xs text-gray-500 mt-0.5">Tally.so + Cal.com pipeline</p></div>
        <div className="flex gap-1.5">
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium">Tally webhook aktivní</span>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">Cal.com sync</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {cols.map(col => {
          const cc = candidates.filter(c => c.stage === col.id);
          return (
            <div key={col.id} className="min-w-0">
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-900">{col.lbl}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{col.sub}</div>
                <span className="inline-block mt-1.5 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px]">{cc.length}</span>
              </div>
              <div className="space-y-2">
                {cc.map(cd => (
                  <div key={cd.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                    <div className="text-[13px] font-semibold text-gray-900">{cd.name}</div>
                    <div className="text-[11px] text-gray-500 mb-2">{cd.phone}</div>
                    <div className="flex gap-1 mb-2">
                      <StatusBadge status="decision" label="Tally" />
                      {cd.calBooked && <StatusBadge status="pending_coo" label="Cal.com" />}
                    </div>
                    {cd.interviewAt && <div className="text-[10px] text-gray-500 mb-2 leading-relaxed">Pohovor: {cd.interviewAt}<br />Holešovická tržnice</div>}
                    <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">{cd.note}</p>
                    {col.id === 'new' && <button onClick={() => advanceCandidate(cd.id)} className="w-full py-1.5 border border-gray-200 rounded-md text-[11px] hover:bg-gray-50">Naplánovat pohovor →</button>}
                    {col.id === 'interview_scheduled' && <button onClick={() => advanceCandidate(cd.id)} className="w-full py-1.5 border border-gray-200 rounded-md text-[11px] hover:bg-gray-50">Zapsat výsledek →</button>}
                    {col.id === 'decision' && (
                      <div className="flex gap-1.5">
                        <button onClick={() => advanceCandidate(cd.id)} className="flex-1 py-1.5 bg-emerald-600 text-white rounded-md text-[11px] hover:bg-emerald-700">Přijmout</button>
                        <button className="flex-1 py-1.5 border border-red-100 text-red-600 rounded-md text-[11px] hover:bg-red-50">Odmítnout</button>
                      </div>
                    )}
                    {col.id === 'accepted' && <><div className="text-[11px] text-emerald-600 font-semibold">Onboarding zahájen ✓</div><div className="text-[10px] text-gray-500 mt-1">Čeká na doplnění IČO/DIČ</div></>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default RecruitmentView;
