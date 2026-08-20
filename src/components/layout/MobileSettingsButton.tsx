import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import type { Contractor } from '../../types';
import { getContractors, subscribeToCrewChanges } from '../../features/crew/services/crew.service';

const getFallbackInitials = (name: string) => name
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toLocaleUpperCase('cs-CZ') || 'ND';

const MobileSettingsButton = () => {
  const { currentProfileId, profile } = useAuth();
  const { setCurrentTab, setSettingsSection } = useAppContext();
  const [contractors, setContractors] = useState<Contractor[]>(() => getContractors() ?? []);

  useEffect(() => subscribeToCrewChanges(() => setContractors(getContractors() ?? [])), []);

  const contractor = currentProfileId
    ? contractors.find((item) => item.profileId === currentProfileId) ?? null
    : null;
  const fallbackName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')
    || profile?.email
    || 'nodu';
  const initials = contractor?.ii || getFallbackInitials(fallbackName);
  const colors = useMemo(() => ({
    backgroundColor: contractor?.bg ?? 'rgb(var(--nodu-accent-rgb) / 0.12)',
    color: contractor?.fg ?? 'var(--nodu-accent)',
  }), [contractor?.bg, contractor?.fg]);

  return (
    <button
      type="button"
      aria-label="Otevřít nastavení"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.08)] text-sm font-bold shadow-[0_12px_28px_rgba(var(--nodu-text-rgb),0.10)] transition-transform active:scale-95 md:hidden"
      style={colors}
      onClick={() => {
        setSettingsSection('menu');
        setCurrentTab('settings');
      }}
    >
      {initials}
    </button>
  );
};

export default MobileSettingsButton;
