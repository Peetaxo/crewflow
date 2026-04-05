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
  <div className="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
    <Icon className="mx-auto text-gray-300 mb-2" size={32} />
    <p className="text-sm text-gray-500">{message}</p>
    {subMessage && <p className="text-xs text-gray-400 mt-1">{subMessage}</p>}
  </div>
);

export default EmptyState;
