import { useId } from 'react';
import type { ProjectWorkPhases as WorkPhases } from '../services/project-work-phases';

type Props = { workPhases: WorkPhases; total: number; isPriceIncomplete: boolean };
const labels = { pripravy: 'Přípravy', instal: 'Instal', provoz: 'Provoz', deinstal: 'Deinstal' };
const numberFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });
const amountLabel = (amount: number) => Number.isFinite(amount) ? `${numberFormat.format(amount)} Kč` : 'Částka není dostupná';
const hoursLabel = (hours: number) => Number.isFinite(hours) ? `${numberFormat.format(hours)} h` : 'Hodiny nejsou dostupné';

export default function ProjectWorkPhases({ workPhases, total, isPriceIncomplete }: Props) {
  const titleId = useId();
  const { phases, unallocated, hasInvoicedAllocation, hasUnallocatedInvoiceCosts } = workPhases;
  const showUnallocated = unallocated.hours !== 0 || unallocated.amount !== 0 || hasUnallocatedInvoiceCosts;
  const rows: { key: string; label: string; hours: string; amount: number }[] = phases.map((phase) => ({ key: phase.type, label: labels[phase.type], hours: hoursLabel(phase.hours), amount: phase.amount }));
  if (showUnallocated) rows.push({ key: 'unallocated', label: 'Nerozřazeno', hours: unallocated.hours > 0 ? hoursLabel(unallocated.hours) : '—', amount: unallocated.amount });
  const sum = rows.reduce((value, row) => value + row.amount, 0);
  const canShowProportions = Number.isFinite(total) && total > 0 && Number.isFinite(sum)
    && rows.every((row) => Number.isFinite(row.amount) && row.amount >= 0)
    && Math.abs(sum - total) <= Math.max(0.001, Number.EPSILON * total * 8);

  return <figure className="project-work-phases" aria-labelledby={titleId}>
    <figcaption className="project-work-phases-heading">
      <h3 id={titleId}>Práce podle fází</h3>
      <dl><div><dt>{isPriceIncomplete ? 'Známá cena práce' : 'Cena práce celkem'}</dt><dd>{amountLabel(total)}</dd></div></dl>
    </figcaption>
    <ul className="project-work-phase-list" aria-label="Skutečné hodiny a cena práce podle fází">
      {rows.map((row) => <li key={row.key} className={`project-work-phase project-work-phase-${row.key}`}>
        <span className="project-work-phase-name">{row.label}</span>
        <span className="project-work-phase-track" aria-hidden="true">{canShowProportions && row.amount > 0 && <span style={{ width: `${row.amount / total * 100}%` }} />}</span>
        <span className="project-work-phase-hours">{row.hours}</span>
        <strong className="project-work-phase-amount">{amountLabel(row.amount)}</strong>
      </li>)}
    </ul>
    {isPriceIncomplete && <p className="project-work-phase-note">Cena práce je neúplná. Zobrazeny jsou známé částky a dostupné skutečně vykázané hodiny.</p>}
    {hasInvoicedAllocation && <p className="project-work-phase-note">Vyfakturovaná cena je rozdělena podle skutečně vykázaných hodin.</p>}
    {hasUnallocatedInvoiceCosts && <p className="project-work-phase-note">U některých faktur chybí úplné a jednoznačné propojení s výkazy. Jejich cena práce je v řádku Nerozřazeno; dostupné hodiny jsou započteny jen jednou.</p>}
    {unallocated.amount !== 0 && unallocated.hours === 0 && !hasUnallocatedInvoiceCosts && <p className="project-work-phase-note">Cenu části práce nelze spolehlivě rozdělit podle fází.</p>}
    {unallocated.hours > 0 && <p className="project-work-phase-note">Část vykázaných hodin nemá podporovanou fázi a je v řádku Nerozřazeno.</p>}
  </figure>;
}
