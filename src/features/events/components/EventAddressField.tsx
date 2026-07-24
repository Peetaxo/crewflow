import React from 'react';
import { LocateFixed } from 'lucide-react';
import {
  searchFreeEventLocations,
} from '../services/event-geocoding.service';
import type { EventGeocodingCandidate } from '../services/event-geocoding.service';
import {
  EventAddressSelection,
  getManualAddressSelection,
} from '../services/event-location.service';

interface EventAddressFieldValue {
  address?: string | null;
  city?: string | null;
  placeId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
}

interface EventAddressFieldProps {
  value: EventAddressFieldValue;
  onChange: (selection: EventAddressSelection) => void;
  geocodeAddress?: (input: string) => Promise<EventGeocodingCandidate[]>;
}

const fieldLabelClass = 'mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]';
const nativeFieldClass = 'w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition-all focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:rgb(var(--nodu-accent-rgb)/0.14)]';
const actionClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--nodu-text)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.32)] hover:text-[color:var(--nodu-accent)] disabled:cursor-not-allowed disabled:opacity-60';

const clean = (value: string | null | undefined) => value?.trim() ?? '';

const getInitialAddress = (value: EventAddressFieldValue) => clean(value.address) || clean(value.city);

const EventAddressField = ({
  value,
  onChange,
  geocodeAddress = searchFreeEventLocations,
}: EventAddressFieldProps) => {
  const addressFromProps = getInitialAddress(value);
  const [inputValue, setInputValue] = React.useState(addressFromProps);
  const [candidates, setCandidates] = React.useState<EventGeocodingCandidate[]>([]);
  const [status, setStatus] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const searchRequestId = React.useRef(0);

  React.useEffect(() => {
    setInputValue(addressFromProps);
  }, [addressFromProps]);

  const handleManualChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextAddress = event.target.value;
    const nextQuery = nextAddress.trim();
    searchRequestId.current += 1;
    setInputValue(nextAddress);
    setIsSearching(false);
    setCandidates([]);
    setStatus(nextQuery && nextQuery.length < 3 ? 'Zadejte alespoň 3 znaky pro vyhledání na mapě.' : '');
    onChange(getManualAddressSelection(nextAddress));
  };

  const handleSearch = async () => {
    const query = inputValue.trim();

    if (query.length < 3) {
      setStatus('Zadejte alespoň 3 znaky pro vyhledání na mapě.');
      return;
    }

    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    setIsSearching(true);
    setCandidates([]);
    setStatus('Hledám polohu na mapě...');

    try {
      const nextCandidates = await geocodeAddress(query);

      if (searchRequestId.current !== requestId) {
        return;
      }

      setCandidates(nextCandidates);
      setStatus(nextCandidates.length > 0
        ? 'Vyberte správnou polohu z výsledků.'
        : 'Poloha nebyla nalezena. Adresu lze uložit ručně.');
    } catch (error) {
      if (searchRequestId.current !== requestId) {
        return;
      }

      setCandidates([]);
      setStatus(error instanceof Error ? error.message : 'Vyhledávání polohy se nepodařilo. Zkuste to prosím znovu.');
    } finally {
      if (searchRequestId.current === requestId) {
        setIsSearching(false);
      }
    }
  };

  const handleSelectCandidate = (candidate: EventGeocodingCandidate) => {
    searchRequestId.current += 1;
    setInputValue(candidate.label);
    setCandidates([]);
    setStatus('Poloha je vybraná z mapových podkladů.');
    onChange({
      address: candidate.label,
      placeId: undefined,
      locationLat: candidate.locationLat,
      locationLng: candidate.locationLng,
    });
  };

  const isSearchDisabled = inputValue.trim().length < 3 || isSearching;

  return (
    <div className="relative">
      <label htmlFor="event-address" className={fieldLabelClass}>Adresa</label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          id="event-address"
          type="text"
          value={inputValue}
          onChange={handleManualChange}
          className={nativeFieldClass}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          className={actionClass}
          disabled={isSearchDisabled}
        >
          <LocateFixed size={14} aria-hidden="true" />
          Najít na mapě
        </button>
      </div>

      {candidates.length > 0 && (
        <div className="mt-2 max-h-52 w-full overflow-y-auto rounded-[18px] border border-[color:var(--nodu-border)] bg-white p-1 shadow-[0_18px_42px_rgba(47,38,31,0.14)]">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => handleSelectCandidate(candidate)}
              className="block w-full rounded-[14px] px-3 py-2 text-left text-sm font-semibold text-[color:var(--nodu-text)] transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)]"
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      {status && (
        <p className="mt-1 text-[11px] font-medium text-[color:var(--nodu-text-soft)]">
          {status}
        </p>
      )}
    </div>
  );
};

export default EventAddressField;
