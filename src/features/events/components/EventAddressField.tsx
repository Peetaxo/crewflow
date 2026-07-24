import React from 'react';
import {
  EventAddressSelection,
  EventAddressSuggestion,
  fetchGoogleAddressSuggestions,
  getManualAddressSelection,
  isGooglePlacesConfigured,
  resolveGoogleAddressSuggestion,
} from '../services/event-location-google.service';

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
  autocompleteEnabled?: boolean;
  fetchSuggestions?: (input: string) => Promise<EventAddressSuggestion[]>;
  resolveSuggestion?: (suggestion: EventAddressSuggestion) => Promise<EventAddressSelection>;
}

const fieldLabelClass = 'mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]';
const nativeFieldClass = 'w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition-all focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:rgb(var(--nodu-accent-rgb)/0.14)]';
const disabledStatus = 'Našeptávání adres není nakonfigurované. Adresu lze zadat ručně.';

const clean = (value: string | null | undefined) => value?.trim() ?? '';

const getInitialAddress = (value: EventAddressFieldValue) => clean(value.address) || clean(value.city);

const EventAddressField = ({
  value,
  onChange,
  autocompleteEnabled = isGooglePlacesConfigured(),
  fetchSuggestions = fetchGoogleAddressSuggestions,
  resolveSuggestion = resolveGoogleAddressSuggestion,
}: EventAddressFieldProps) => {
  const addressFromProps = getInitialAddress(value);
  const [inputValue, setInputValue] = React.useState(addressFromProps);
  const [suggestions, setSuggestions] = React.useState<EventAddressSuggestion[]>([]);
  const [hasTyped, setHasTyped] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [isResolving, setIsResolving] = React.useState(false);

  React.useEffect(() => {
    setInputValue(addressFromProps);
  }, [addressFromProps]);

  React.useEffect(() => {
    if (!autocompleteEnabled) {
      setSuggestions([]);
      setStatus(disabledStatus);
      return;
    }

    const query = inputValue.trim();
    if (!hasTyped || query.length < 3) {
      setSuggestions([]);
      setStatus(query ? 'Pro návrhy zadejte alespoň 3 znaky.' : '');
      return;
    }

    let isActive = true;
    setStatus('Hledám adresy...');

    void fetchSuggestions(query)
      .then((nextSuggestions) => {
        if (!isActive) return;
        setSuggestions(nextSuggestions);
        setStatus(nextSuggestions.length > 0 ? 'Vyberte adresu z návrhů.' : 'Žádný návrh adresy nenalezen. Adresu lze zadat ručně.');
      })
      .catch(() => {
        if (!isActive) return;
        setSuggestions([]);
        setStatus('Našeptávání adres se nepodařilo načíst. Adresu lze zadat ručně.');
      });

    return () => {
      isActive = false;
    };
  }, [autocompleteEnabled, fetchSuggestions, hasTyped, inputValue]);

  const handleManualChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextAddress = event.target.value;
    setInputValue(nextAddress);
    setHasTyped(true);
    onChange(getManualAddressSelection(nextAddress));
  };

  const handleSelectSuggestion = async (suggestion: EventAddressSuggestion) => {
    setIsResolving(true);
    try {
      const selection = await resolveSuggestion(suggestion);
      setInputValue(selection.address);
      setSuggestions([]);
      setHasTyped(false);
      setStatus('Adresa je vybraná z mapových podkladů.');
      onChange(selection);
    } catch {
      setStatus('Adresu se nepodařilo načíst. Adresu lze zadat ručně.');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor="event-address" className={fieldLabelClass}>Adresa</label>
      <input
        id="event-address"
        type="text"
        value={inputValue}
        onChange={handleManualChange}
        className={nativeFieldClass}
        autoComplete="off"
      />

      {suggestions.length > 0 && (
        <div className="absolute z-30 mt-2 max-h-52 w-full overflow-y-auto rounded-[18px] border border-[color:var(--nodu-border)] bg-white p-1 shadow-[0_18px_42px_rgba(47,38,31,0.14)]">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => void handleSelectSuggestion(suggestion)}
              className="block w-full rounded-[14px] px-3 py-2 text-left text-sm font-semibold text-[color:var(--nodu-text)] transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)]"
              disabled={isResolving}
            >
              {suggestion.label}
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
