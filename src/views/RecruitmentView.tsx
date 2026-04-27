import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
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
    setCandidates(getCandidates() ?? []);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToCandidateChanges(loadData), [loadData]);
  const safeCandidates = candidates ?? [];

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
          <div className="nodu-dashboard-kicker">Recruitment</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Nábor</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Tally.so + Cal.com pipeline</p>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded-full bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--nodu-accent)]">
            Tally webhook aktivní
          </span>
          <span className="rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--nodu-text)]">
            Cal.com sync
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-4">
        {cols.map((col) => {
          const cc = safeCandidates.filter((candidate) => candidate.stage === col.id);
          return (
            <div key={col.id} className="min-w-0">
              <div className="mb-3">
                <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{col.lbl}</div>
                <div className="mt-0.5 text-[10px] text-[color:var(--nodu-text-soft)]">{col.sub}</div>
                <span className="mt-1.5 inline-block rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2 py-0.5 text-[10px] text-[color:var(--nodu-text-soft)]">
                  {cc.length}
                </span>
              </div>
              <div className="space-y-2">
                {cc.map((candidate) => (
                  <div key={candidate.id} className="rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-3 shadow-[0_14px_32px_rgba(47,38,31,0.08)]">
                    <div className="text-[13px] font-semibold text-[color:var(--nodu-text)]">{candidate.name}</div>
                    <div className="mb-2 text-[11px] text-[color:var(--nodu-text-soft)]">{candidate.phone}</div>
                    <div className="mb-2 flex gap-1">
                      <StatusBadge status="decision" label="Tally" />
                      {candidate.calBooked && <StatusBadge status="pending_coo" label="Cal.com" />}
                    </div>
                    {candidate.interviewAt && (
                      <div className="mb-2 text-[10px] leading-relaxed text-[color:var(--nodu-text-soft)]">
                        Pohovor: {candidate.interviewAt}
                        <br />
                        Holešovická tržnice
                      </div>
                    )}
                    <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--nodu-text-soft)]">{candidate.note}</p>
                    {col.id === 'new' && (
                      <Button
                        onClick={() => advanceCandidate(candidate.id)}
                        variant="outline"
                        size="sm"
                        className="w-full text-[11px]"
                      >
                        Naplánovat pohovor →
                      </Button>
                    )}
                    {col.id === 'interview_scheduled' && (
                      <Button
                        onClick={() => advanceCandidate(candidate.id)}
                        variant="outline"
                        size="sm"
                        className="w-full text-[11px]"
                      >
                        Zapsat výsledek →
                      </Button>
                    )}
                    {col.id === 'decision' && (
                      <div className="flex gap-1.5">
                        <Button
                          onClick={() => advanceCandidate(candidate.id)}
                          size="sm"
                          className="flex-1 text-[11px]"
                        >
                          Přijmout
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]">
                          Odmítnout
                        </Button>
                      </div>
                    )}
                    {col.id === 'accepted' && (
                      <>
                        <div className="text-[11px] font-semibold text-[color:var(--nodu-accent)]">Onboarding zahájen ✓</div>
                        <div className="mt-1 text-[10px] text-[color:var(--nodu-text-soft)]">Čeká na doplnění IČO/DIČ</div>
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
