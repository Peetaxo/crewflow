import React from 'react';

const StatusBadge = ({ status, label }: { status: string; label?: string }) => {
  const neutral = 'border-[color:rgb(var(--nodu-text-rgb)/0.1)] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] text-[color:var(--nodu-text-soft)]';
  const success = 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]';
  const info = 'border-[color:var(--nodu-info-border)] bg-[color:var(--nodu-info-bg)] text-[color:var(--nodu-info-text)]';
  const warning = 'border-[color:var(--nodu-warning-border)] bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]';
  const error = 'border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] text-[color:var(--nodu-error-text)]';
  const decision = 'border-[color:rgb(var(--nodu-accent-rgb)/0.22)] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]';

  const statusMap: Record<string, [string, string]> = {
    draft: [neutral, 'Koncept'],
    pending_ch: [warning, 'Čeká CH'],
    pending_coo: [info, 'Čeká COO'],
    approved: [success, 'Schváleno'],
    invoiced: [info, 'Fakturovano'],
    paid: [success, 'Zaplaceno'],
    rejected: [error, 'Zamítnuto'],
    sent: [info, 'Odesláno'],
    submitted: [warning, 'Čeká na schválení'],
    attached: [info, 'Ve faktuře'],
    reimbursed: [success, 'Proplaceno'],
    upcoming: [info, 'Nadcházející'],
    full: [success, 'Obsazeno'],
    planning: [neutral, 'Plánování'],
    new: [info, 'Nový'],
    interview_scheduled: [warning, 'Pohovor'],
    decision: [decision, 'Rozhodnutí'],
    accepted: [success, 'Přijat'],
    instal: [info, 'Instal'],
    provoz: [success, 'Provoz'],
    deinstal: [warning, 'Deinstal'],
    past: [neutral, 'Uplynulé'],
  };

  const [cls, defaultLabel] = statusMap[status] || [neutral, status];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label || defaultLabel}
    </span>
  );
};

export default StatusBadge;
