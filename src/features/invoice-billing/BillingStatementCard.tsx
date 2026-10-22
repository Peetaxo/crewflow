import { billingActorName, billingSourceApproval, type BillingActor } from './billing-actors';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { formatBillingHours, formatBillingMoney, type BillingDocument, type BillingJob, type BillingScope, type BillingStatement } from './contract';
import { makeBillingCommand, type BillingCommand } from './service';
import { BillingFinancePreview } from './BillingFinancePreview';
import { BillingUploadForm } from './BillingUploadForm';
import { BillingDistanceRepair } from './BillingDistanceRepair';
import styles from './BillingPresentation.module.css';
const billingStateLabels = { ready: 'K fakturaci', blocked: 'Podklad vyžaduje doplnění', document_pending: 'Originál čeká na kontrolu CH', document_returned: 'Originál vrácen CH', issued: 'Faktura vytvořena' };
const reasons: Record<string, string> = {
  source_missing: 'Chybí zdrojové výkazy. Podklad musí ověřit COO.', mixed_supplier: 'Podklad obsahuje různé dodavatele. COO musí ověřit zdrojové výkazy.',
  supplier_data_incomplete: 'Údaje dodavatele nejsou úplné. Dodavatel je doplní v nastavení profilu.',
  customer_data_incomplete: 'Údaje koncového odběratele nejsou úplné. COO doplní údaje klienta.',
  approval_quote_required: 'Chybí ověřený cenový náhled schválení. Podklad musí ověřit COO.',
  invoice_billing_identity_refresh_required: 'Fakturační údaje se změnily. Obnovte údaje podkladu.',
  invoice_billing_preview_expired: 'Platnost náhledu vypršela. Obnovte údaje a data náhledu.',
  customer_missing: 'Chybí koncový odběratel. COO doplní klienta projektu a obnoví podklad.', mixed_customer: 'Výkazy mají různé odběratele. COO musí vyřešit přiřazení projektů a připravit přesný výběr.',
  financial_data_incomplete: 'Finanční údaje nejsou úplné. COO musí doplnit ověřená data.', customer_identity_refresh_required: 'Údaje odběratele se změnily. COO obnoví podklad.',
  financial_preview_required: 'Finanční podklad vyžaduje ověření COO.', statement_consolidated: 'Podklad byl nahrazen sloučeným podkladem.',
};
export function BillingStatementCard({ statement: s, documents, jobs, scope, onCommand, onDownload, onBillingSettings, busy, readOnly = false, actors = [] }: {
  actors?: readonly BillingActor[];
  statement: BillingStatement; documents: BillingDocument[]; jobs: BillingJob[]; scope: BillingScope; onCommand: (command: BillingCommand) => void;
  onDownload: (path: string) => void; onBillingSettings: () => void; busy: boolean; readOnly?: boolean;
}) {
  const [mode, setMode] = useState<'none' | 'self' | 'upload'>('none'); const [confirmed, setConfirmed] = useState(false); const [note, setNote] = useState('');
  const preview = useRef<HTMLDetailsElement>(null);
  const owned = scope.role === 'crew' && scope.profileId === s.contractorId && scope.userId === s.contractorUserId;
  const closed = s.needsSourceVerification || readOnly || Boolean(s.supersededByStatementId) || s.status === 'issued';
  const activeDocument = documents.find((d) => d.id === s.activeDocumentId);
  const ownDocuments = documents.filter((d) => d.statementId === s.id);
  const issueJob = jobs.find((j) => j.statementId === s.id && j.kind === 'issue' && ['queued', 'running'].includes(j.status));
  const allowed = !closed && !issueJob && ['ready', 'document_returned'].includes(s.status);
  const reports = s.financialSnapshot.reports;
  const eventNames = [...new Set(reports.map((report) => report.eventName))].join(' · ');
  const jobNumbers = [...new Set(reports.map((report) => report.jobNumber || 'Bez čísla zakázky'))].join(' · ');
  const badgeTone = s.status === 'blocked' || s.status === 'document_returned' ? styles.error
    : s.status === 'document_pending' ? styles.warning : s.status === 'issued' ? styles.success : '';
  const review = (decision: 'accept' | 'return') => activeDocument && onCommand(makeBillingCommand({ kind: 'review', statementId: s.id, documentId: activeDocument.id, expectedUpdatedAt: s.updatedAt, decision, note: decision === 'return' ? note.trim() : '' }));
  return <article className={`nodu-panel ${styles.card}`}>
    <header className={styles.cardHeader}>
      <div className={styles.identity}>
        <span className={`${styles.badge} ${badgeTone}`}>{billingStateLabels[s.status]}{closed && s.supersededByStatementId ? ' · Historie, nahrazeno' : ''}</span>
        <h3>{eventNames || 'Fakturační podklad'}</h3>
        <p className={styles.muted}>{jobNumbers}</p>
      </div>
      <div className={styles.amount}><span className={styles.amountLabel}>Celkem k fakturaci</span><strong>{s.financialVerified ? formatBillingMoney(s.totalAmount) : 'Částka k ověření'}</strong></div>
    </header>
    <dl className={styles.facts}>
      <div><dt>Dodavatel</dt><dd>{s.supplierSnapshot.name || 'Dodavatel neznámý'}</dd></div>
      <div><dt>Odběratel</dt><dd>{s.customerSnapshot.name || 'Chybí odběratel'}</dd></div>
      <div><dt>Schválená práce</dt><dd>{reports.map((report) => <span key={report.timelogId}>{formatBillingHours(report.hours)}{reports.length > 1 ? ` · ${report.jobNumber || report.eventName}` : ''}</span>)}</dd></div>
      <div><dt>Období</dt><dd>{reports.map((report) => <span key={report.timelogId}>{report.dateFrom || 'Neznámé datum'}{report.dateTo !== report.dateFrom ? ` – ${report.dateTo || 'Neznámé datum'}` : ''}</span>)}</dd></div>
    </dl>
    {s.needsSourceVerification && <p className={styles.notice} role="status">Historický náhled zachycuje původní verzi před schválením. Podklad je dostupný pouze ke čtení a vyžaduje ověření zdrojů.</p>}
    {s.blockedReason && <p className={styles.notice} role="status">{reasons[s.blockedReason] ?? 'Podklad vyžaduje ověření COO. Obnovte podklady nebo požádejte o kontrolu.'}</p>}
    {issueJob && <p className={styles.notice} role="status">Čeká na automatické vystavení podle dřívějšího souhlasu. Faktura zatím nevznikla.</p>}
    <details ref={preview} className={styles.disclosure}>
      <summary>Přesný finanční náhled</summary>
      <div className={styles.preview}>
        <p className={styles.muted}>{s.captureKind === 'selection' ? 'Podklad připravil/a' : 'Finální schválení'}: {billingActorName(actors, { userId: s.approvedBy })} · {new Date(s.captureKind === 'selection' ? s.createdAt : s.approvedAt).toLocaleString('cs-CZ')}</p>
        {s.captureKind === 'selection' && s.sources.map((source) => {
          const approval = billingSourceApproval(source);
          return <p key={source.timelogId} className={styles.muted}>Schválení výkazu {source.sourceSnapshot.eventName}: {billingActorName(actors, approval)} · {approval.approvedAt ? new Date(approval.approvedAt).toLocaleString('cs-CZ') : 'Čas není zaznamenán'}</p>;
        })}
        <BillingFinancePreview finance={s.financialSnapshot} />
        <dl className={styles.facts}>
          <div><dt>Vystavení</dt><dd>{s.previewIssueDate}</dd></div>
          <div><dt>Splatnost</dt><dd>{s.previewDueDate}</dd></div>
          <div><dt>Datum plnění</dt><dd>{s.previewTaxableSupplyDate || 'Neuvedeno'}</dd></div>
        </dl>
      </div>
    </details>
    {owned && !closed && <div className={styles.actions}>
      {allowed && <><Button disabled={busy} onClick={() => { if (preview.current) preview.current.open = true; setMode('upload'); setConfirmed(false); }}>Nahrát vlastní PDF</Button><Button disabled={busy} variant="outline" onClick={() => { if (preview.current) preview.current.open = true; setMode('self'); }}>Vystavit mým jménem</Button></>}
      {s.status !== 'document_pending' && !issueJob && <Button disabled={busy} variant="outline" onClick={() => onCommand(makeBillingCommand({ kind: 'refresh', statementId: s.id, expectedUpdatedAt: s.updatedAt }))}>Obnovit údaje a data náhledu</Button>}
      <Button variant="link" onClick={onBillingSettings}>Nastavení → Fakturace</Button>
    </div>}
    {owned && allowed && mode === 'self' && <div className={styles.consent}><p>Vystavení jedné faktury vaším jménem podle tohoto přesného náhledu. Zkontrolujte dodavatele, koncového odběratele, částky a data výše.</p>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} /><span>Prohlašuji, že nejsem plátcem DPH, a souhlasím s vystavením této konkrétní faktury mým jménem.</span></label>
      <Button disabled={busy || !confirmed} onClick={() => onCommand(makeBillingCommand({ kind: 'confirm', statementId: s.id, expectedUpdatedAt: s.updatedAt, nonVatConfirmed: confirmed }))}>Potvrdit a vystavit fakturu</Button></div>}
    {owned && allowed && mode === 'upload' && <BillingUploadForm statement={s} busy={busy} onCommand={onCommand} />}
    {!closed && scope.role === 'crewhead' && s.status === 'document_pending' && activeDocument && !activeDocument.decision && <div className={styles.review}>
      <Button variant="outline" onClick={() => onDownload(activeDocument.storagePath)}>Otevřít aktivní originál PDF</Button>
      <label className="block">Důvod vrácení originálu<Input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} /></label>
      <div className={styles.actions}><Button disabled={busy} onClick={() => review('accept')}>Přijmout originál</Button><Button variant="outline" disabled={busy || !note.trim()} onClick={() => review('return')}>Vrátit originál</Button></div>
    </div>}
    {!closed && scope.role === 'coo' && s.status === 'blocked' && <><BillingDistanceRepair statement={s} busy={busy} onCommand={onCommand} />
      <Button disabled={busy} variant="outline" onClick={() => onCommand(makeBillingCommand({ kind: 'prepare', timelogIds: s.sources.map((x) => x.timelogId) }))}>Obnovit přesný podklad</Button></>}
    {ownDocuments.length > 0 && <details className={styles.disclosure} open={s.status === 'document_returned'}><summary>Historie originálů ({ownDocuments.length})</summary><ul className={styles.history}>{ownDocuments.map((doc) => <li key={doc.id}>
      <Button variant="link" onClick={() => onDownload(doc.storagePath)}>{doc.externalInvoiceNumber} · {doc.decision?.decision === 'accept' ? 'Přijatý originál' : doc.decision?.decision === 'return' ? 'Vrácený originál' : 'Čeká na kontrolu'}</Button>
      {doc.decision && <p>Kontrolu originálu provedl/a: {billingActorName(actors, { userId: doc.decision.actorId })} · {new Date(doc.decision.createdAt).toLocaleString('cs-CZ')}</p>}
      {doc.decision?.note && <p>{doc.decision.note}</p>}</li>)}</ul></details>}
    {!readOnly && jobs.filter((j) => j.statementId === s.id && j.canRetry && ['crew', 'coo'].includes(scope.role) && !s.supersededByStatementId && !s.needsSourceVerification).map((j) => <div key={j.id}><p>{j.failureCode === 'retry_budget_exhausted' || j.failureCode === 'lease_expired_budget' ? 'Automatické pokusy byly vyčerpány.' : 'Zpracování čeká na opakování.'}</p>
      <Button disabled={busy} variant="outline" onClick={() => onCommand(makeBillingCommand({ kind: 'retry', statementId: s.id, jobId: j.id, expectedUpdatedAt: s.updatedAt, expectedJobUpdatedAt: j.updatedAt }))}>{j.kind === 'pdf' ? 'Znovu zpracovat PDF stejné faktury' : 'Znovu zpracovat stejný podklad'}</Button></div>)}
  </article>;
}
