import React from 'react';
import { CarFront, CheckCheck, CircleCheck, Coins, FileText, PencilLine, Utensils } from 'lucide-react';
import { formatCurrency } from '../../../utils';
import type { ProjectSummary } from '../services/project-summary';
import ProjectWorkPhases from './ProjectWorkPhases';

type Props = Pick<ProjectSummary, 'costs' | 'stages' | 'hasMissingRates' | 'hasUnknownInvoiceAllocation'> & Partial<Pick<ProjectSummary, 'workPhases'>>;
const categories = [
  { key: 'travel', label: 'Doprava', Icon: CarFront },
  { key: 'meals', label: 'Stravné', Icon: Utensils },
] as const;
const costStages = [
  { key: 'inProgress', label: 'Rozpracováno', Icon: PencilLine },
  { key: 'approved', label: 'Schváleno', Icon: CircleCheck },
  { key: 'invoiced', label: 'Vyfakturováno', Icon: FileText },
  { key: 'paid', label: 'Uhrazeno', Icon: CheckCheck },
] as const;
const amountLabel = (amount: number) => Number.isFinite(amount) ? formatCurrency(amount) : 'Částka není dostupná';

const ProjectCosts = ({ costs, stages, hasMissingRates, hasUnknownInvoiceAllocation, workPhases }: Props) => {
  return <>
    <div className="project-cost-total">
      <dl><div><dt>Celkem</dt><dd>{amountLabel(costs.total)}</dd></div></dl>
      <span className="project-cost-total-icon"><Coins aria-hidden="true" /></span>
    </div>
    {workPhases && <ProjectWorkPhases workPhases={workPhases} total={costs.work} isPriceIncomplete={hasMissingRates || hasUnknownInvoiceAllocation} />}
    <dl className="project-cost-categories">
      {categories.map(({ key, label, Icon }) => <div className={`project-cost-category project-cost-category-${key}`} key={key}>
        <Icon aria-hidden="true" /><dt>{label}</dt><dd>{amountLabel(costs[key])}</dd>
      </div>)}
    </dl>
    <p className="project-cost-stage-title">Stav nákladů</p>
    <dl className="project-cost-stages">
      {costStages.map(({ key, label, Icon }) => <div key={key} className={`project-cost-stage${key === 'paid' ? ' project-cost-stage-paid' : ''}`}>
        <dt><Icon aria-hidden="true" />{label}</dt><dd>{amountLabel(stages[key].total)}</dd>
      </div>)}
    </dl>
    {hasUnknownInvoiceAllocation && <p className="project-overview-notice">Některé podíly faktur nejsou známé. Uvedené součty zahrnují pouze známé částky.</p>}
    {hasMissingRates && <p className="project-overview-notice">U některých členů Crew chybí sazba. Náklady na práci jsou neúplné.</p>}
  </>;
};
export default ProjectCosts;
