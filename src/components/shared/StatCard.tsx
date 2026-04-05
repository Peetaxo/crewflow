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
  <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
    <div className="text-2xl font-semibold text-gray-900">{value}</div>
    <div className="mt-1">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
        {sub}
      </span>
    </div>
  </div>
);

export default StatCard;
