import React from 'react';

/** Statistická karta pro dashboard */
const StatCard = ({
  label,
  value,
  sub,
  cls,
}: {
  label: string;
  value: string | number;
  sub: string;
  cls: string;
}) => (
  <div className="rounded-[20px] border border-gray-200 bg-white p-4 shadow-sm">
    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</div>
    <div className="text-[28px] font-semibold leading-none text-gray-900">{value}</div>
    <div className="mt-3">
      <span className={`nodu-stat-chip ${cls}`}>
        {sub}
      </span>
    </div>
  </div>
);

export default StatCard;
