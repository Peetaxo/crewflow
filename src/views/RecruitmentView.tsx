import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import StatusBadge from '../components/shared/StatusBadge';
import type { Candidate } from '../types';
import {
  advanceCandidate,
  getCandidates,
  subscribeToCandidateChanges,
} from '../features/recruitment/services/candidates.service';

const RecruitmentView = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const loadData = useCallback(() => {
    setCandidates(getCandidates());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToCandidateChanges(loadData), [loadData]);

  const cols = [
    { id: 'new', lbl: 'Nový zájemce', sub: 'Příchozí z Tally.so' },
    { id: 'interview_scheduled', lbl: 'Pohovor naplánován', sub: 'Cal.com booking' },
    { id: 'decision', lbl: 'Rozhodnutí', sub: 'Proběhl pohovor' },
    { id: 'accepted', lbl: 'Přijat / Onboarding', sub: 'Stává se kontraktorem' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Nábor</h1>
          <p className="mt-0.5 text-xs text-gray-500">Tally.so + Cal.com pipeline</p>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            Tally webhook aktivní
          </span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            Cal.com sync
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-4">
        {cols.map((col) => {
          const cc = candidates.filter((candidate) => candidate.stage === col.id);
          return (
            <div key={col.id} className="min-w-0">
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-900">{col.lbl}</div>
                <div className="mt-0.5 text-[10px] text-gray-500">{col.sub}</div>
                <span className="mt-1.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                  {cc.length}
                </span>
              </div>
              <div className="space-y-2">
                {cc.map((candidate) => (
                  <div key={candidate.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="text-[13px] font-semibold text-gray-900">{candidate.name}</div>
                    <div className="mb-2 text-[11px] text-gray-500">{candidate.phone}</div>
                    <div className="mb-2 flex gap-1">
                      <StatusBadge status="decision" label="Tally" />
                      {candidate.calBooked && <StatusBadge status="pending_coo" label="Cal.com" />}
                    </div>
                    {candidate.interviewAt && (
                      <div className="mb-2 text-[10px] leading-relaxed text-gray-500">
                        Pohovor: {candidate.interviewAt}
                        <br />
                        Holešovická tržnice
                      </div>
                    )}
                    <p className="mb-3 text-[11px] leading-relaxed text-gray-500">{candidate.note}</p>
                    {col.id === 'new' && (
                      <button
                        onClick={() => advanceCandidate(candidate.id)}
                        className="w-full rounded-md border border-gray-200 py-1.5 text-[11px] hover:bg-gray-50"
                      >
                        Naplánovat pohovor →
                      </button>
                    )}
                    {col.id === 'interview_scheduled' && (
                      <button
                        onClick={() => advanceCandidate(candidate.id)}
                        className="w-full rounded-md border border-gray-200 py-1.5 text-[11px] hover:bg-gray-50"
                      >
                        Zapsat výsledek →
                      </button>
                    )}
                    {col.id === 'decision' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => advanceCandidate(candidate.id)}
                          className="flex-1 rounded-md bg-emerald-600 py-1.5 text-[11px] text-white hover:bg-emerald-700"
                        >
                          Přijmout
                        </button>
                        <button className="flex-1 rounded-md border border-red-100 py-1.5 text-[11px] text-red-600 hover:bg-red-50">
                          Odmítnout
                        </button>
                      </div>
                    )}
                    {col.id === 'accepted' && (
                      <>
                        <div className="text-[11px] font-semibold text-emerald-600">Onboarding zahájen ✓</div>
                        <div className="mt-1 text-[10px] text-gray-500">Čeká na doplnění IČO/DIČ</div>
                      </>
                    )}
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
