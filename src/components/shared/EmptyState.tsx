import React from 'react';
import { LucideIcon } from 'lucide-react';

/** Prázdný stav — ikona + zpráva */
const EmptyState = ({
  icon: Icon,
  message,
  subMessage,
}: {
  icon: LucideIcon;
  message: string;
  subMessage?: string;
}) => (
  <div className="col-span-full rounded-[28px] border border-dashed border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-surface-rgb)/0.96)] py-12 text-center shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
    <Icon className="mx-auto mb-2 text-[color:rgb(var(--nodu-accent-rgb)/0.62)]" size={32} />
    <p className="text-sm text-[color:var(--nodu-text)]">{message}</p>
    {subMessage && <p className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">{subMessage}</p>}
  </div>
);

export default EmptyState;
