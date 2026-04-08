import React from 'react';

const StatusBadge = ({ status, label }: { status: string; label?: string }) => {
  const statusMap: Record<string, [string, string]> = {
    draft: ['bg-gray-100 text-gray-600', 'Koncept'],
    pending_ch: ['bg-amber-50 text-amber-700', 'Čeká CH'],
    pending_coo: ['bg-blue-50 text-blue-700', 'Čeká COO'],
    approved: ['bg-emerald-50 text-emerald-700', 'Schváleno'],
    invoiced: ['bg-teal-50 text-teal-700', 'Fakturovano'],
    paid: ['bg-teal-50 text-teal-700', 'Zaplaceno'],
    rejected: ['bg-red-50 text-red-700', 'Zamítnuto'],
    sent: ['bg-blue-50 text-blue-700', 'Odesláno'],
    disputed: ['bg-red-50 text-red-700', 'Rozporovano'],
    submitted: ['bg-amber-50 text-amber-700', 'Čeká na schválení'],
    attached: ['bg-cyan-50 text-cyan-700', 'Ve faktuře'],
    reimbursed: ['bg-teal-50 text-teal-700', 'Proplaceno'],
    upcoming: ['bg-blue-50 text-blue-700', 'Nadcházející'],
    full: ['bg-emerald-50 text-emerald-700', 'Obsazeno'],
    planning: ['bg-gray-100 text-gray-600', 'Plánování'],
    new: ['bg-blue-50 text-blue-700', 'Nový'],
    interview_scheduled: ['bg-amber-50 text-amber-700', 'Pohovor'],
    decision: ['bg-indigo-50 text-indigo-700', 'Rozhodnutí'],
    accepted: ['bg-emerald-50 text-emerald-700', 'Přijat'],
    instal: ['bg-blue-50 text-blue-700', 'Instal'],
    provoz: ['bg-emerald-50 text-emerald-700', 'Provoz'],
    deinstal: ['bg-amber-50 text-amber-700', 'Deinstal'],
    past: ['bg-gray-100 text-gray-500', 'Uplynulé'],
  };

  const [cls, defaultLabel] = statusMap[status] || ['bg-gray-100 text-gray-600', status];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {label || defaultLabel}
    </span>
  );
};

export default StatusBadge;
