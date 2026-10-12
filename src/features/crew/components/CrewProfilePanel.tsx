import { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Contractor } from '../../../types';
import { Button } from '../../../components/ui/button';
import { updateCrew } from '../services/crew.service';

export default function CrewProfilePanel({ contractor }: { contractor: Contractor }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rate, setRate] = useState(String(contractor.rate));
  const [note, setNote] = useState(contractor.note ?? '');
  const reset = () => { setRate(String(contractor.rate)); setNote(contractor.note ?? ''); setEditing(false); };
  const save = async () => {
    const amount = Number(rate);
    if (!rate.trim() || !Number.isFinite(amount) || amount < 0) { toast.error('Vyplň platnou nezápornou sazbu.'); return; }
    setSaving(true);
    try { await updateCrew({ ...contractor, rate: amount, note }); setEditing(false); toast.success('Sazba a poznámka uložené.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Profil se nepodařilo uložit.'); }
    finally { setSaving(false); }
  };
  const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-[var(--nodu-border)] bg-white px-3 py-2 text-sm text-[var(--nodu-text)] outline-none focus:border-[var(--nodu-accent)]';
  const rows: [string, string | undefined][] = [
    ['Telefon', contractor.phone], ['E-mail', contractor.email], ['Město', contractor.city], ['Počet akcí', String(contractor.events)],
    ['IČO', contractor.ico], ['DIČ', contractor.dic], ['Bankovní účet', contractor.bank], ['IBAN', contractor.iban],
    ['Jméno / firma', contractor.billingName || contractor.name], ['Ulice a číslo', contractor.billingStreet], ['PSČ', contractor.billingZip],
    ['Fakturační město', contractor.billingCity || contractor.city], ['Země', contractor.billingCountry || 'Česká republika'],
  ];
  return <div className="space-y-4">
    <section className="rounded-[24px] border border-[var(--nodu-border)] bg-white p-4 sm:p-5" aria-label="Sazba a poznámka">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-[var(--nodu-text)]">Sazba a poznámka</h2>
        {!editing && <Button type="button" variant="ghost" className="h-11" onClick={() => { setRate(String(contractor.rate)); setNote(contractor.note ?? ''); setEditing(true); }}><Pencil size={14} />Upravit</Button>}
      </div>
      {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4">
        <label className="block text-xs text-[var(--nodu-text-soft)]">Hodinová sazba (Kč)<input type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(event) => setRate(event.target.value)} className={inputClass} disabled={saving} /></label>
        <label className="block text-xs text-[var(--nodu-text-soft)]">Poznámka<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} disabled={saving} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={reset} disabled={saving}>Zrušit</Button><Button type="submit" className="min-h-11" disabled={saving}>{saving ? 'Ukládám…' : 'Uložit'}</Button></div>
      </form> : <div><p className="text-base font-semibold text-[var(--nodu-text)]">{contractor.rate.toLocaleString('cs-CZ')} Kč/h</p><p className="mt-3 whitespace-pre-wrap break-words text-sm text-[var(--nodu-text-soft)]">{contractor.note || 'Zatím bez poznámky.'}</p></div>}
    </section>
    <details className="group rounded-[24px] border border-[var(--nodu-border)] bg-white p-4 sm:p-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--nodu-text)] [&::-webkit-details-marker]:hidden">Profil a fakturační údaje<ChevronDown size={17} className="shrink-0 transition-transform group-open:rotate-180" /></summary>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="min-w-0 border-b border-[var(--nodu-border)] pb-3"><dt className="text-xs text-[var(--nodu-text-soft)]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[var(--nodu-text)] [overflow-wrap:anywhere]">{value || 'Neuvedeno'}</dd></div>)}</dl>
      {contractor.tags.length > 0 && <p className="mt-4 break-words text-xs text-[var(--nodu-text-soft)]">Štítky: {contractor.tags.join(', ')}</p>}
    </details>
  </div>;
}
