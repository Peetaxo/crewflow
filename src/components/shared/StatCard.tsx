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
  <div className="nodu-stat-card">
    <div className="nodu-stat-label">{label}</div>
    <div className="nodu-stat-value">{value}</div>
    <div className="mt-3">
      <span className={`nodu-stat-chip ${cls}`}>
        {sub}
      </span>
    </div>
  </div>
);

export default StatCard;
