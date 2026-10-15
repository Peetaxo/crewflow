import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { formatBillingMoney, type BillingDocument, type BillingJob, type BillingScope, type BillingStatement } from './contract';
import { makeBillingCommand, type BillingCommand } from './service';
import { BillingFinancePreview } from './BillingFinancePreview';
import { BillingUploadForm } from './BillingUploadForm';
import { BillingDistanceRepair } from './BillingDistanceRepair';
const billingStateLabels = { ready: 'K fakturaci', blocked: 'Podklad vyžaduje doplnění', document_pending: 'Originál čeká na kontrolu CH', document_returned: 'Originál vrácen CH', issued: 'Faktura vytvořena' };
const reasons: Record<string, string> = {
  customer_missing: 'Chybí koncový odběratel. COO doplní klienta projektu a obnoví podklad.', mixed_customer: 'Výkazy mají různé odběratele. COO musí vyřešit přiřazení projektů a připravit přesný výběr.',
  financial_data_incomplete: 'Finanční údaje nejsou úplné. COO musí doplnit ověřená data.', customer_identity_refresh_required: 'Údaje odběratele se změnily. COO obnoví podklad.',
  financial_preview_required: 'Finanční podklad vyžaduje ověření COO.', statement_consolidated: 'Podklad byl nahrazen sloučeným podkladem.',
};
export function BillingStatementCard({ statement: s, documents, jobs, scope, onCommand, onDownload, onBillingSettings, busy, readOnly = false }: {
  statement: BillingStatement; documents: BillingDocument[]; jobs: BillingJob[]; scope: BillingScope; onCommand: (command: BillingCommand) => void;
  onDownload: (path: string) => void; onBillingSettings: () => void; busy: boolean; readOnly?: boolean;
}) {
  const [mode, setMode] = useState<'none' | 'self' | 'upload'>('none'); const [confirmed, setConfirmed] = useState(false); const [note, setNote] = useState('');
  const owned = scope.role === 'crew' && scope.profileId === s.contractorId && scope.userId === s.contractorUserId;
  const closed = s.needsSourceVerification || readOnly || Boolean(s.supersededByStatementId) || s.status === 'issued';
  const activeDocument = documents.find((d) => d.id === s.activeDocumentId);
  const ownDocuments = documents.filter((d) => d.statementId === s.id);
  const issueJob = jobs.find((j) => j.statementId === s.id && j.kind === 'issue' && ['queued', 'running'].includes(j.status));
  const allowed = !closed && !issueJob && ['ready', 'document_returned'].includes(s.status);
  const review = (decision: 'accept' | 'return') => activeDocument && onCommand(makeBillingCommand({ kind: 'review', statementId: s.id, documentId: activeDocument.id, expectedUpdatedAt: s.updatedAt, decision, note: decision === 'return' ? note.trim() : '' }));
  return <article className="nodu-panel space-y-3 rounded-2xl p-5">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{billingStateLabels[s.status]}{closed && s.supersededByStatementId ? ' · Historie, nahrazeno' : ''}</h3><strong>{s.financialVerified ? formatBillingMoney(s.totalAmount) : 'Částka k ověření'}</strong></div>
    {s.needsSourceVerification && <p role="status">Historický náhled zachycuje původní verzi před schválením. Podklad je dostupný pouze ke čtení a vyžaduje ověření zdrojů.</p>}
    {s.blockedReason && <p role="status">{reasons[s.blockedReason] ?? `Podklad je blokován: ${s.blockedReason}`}</p>}
    {issueJob && <p role="status">Čeká na automatické vystavení podle dřívějšího souhlasu. Faktura zatím nevznikla.</p>}
    <BillingFinancePreview finance={s.financialSnapshot} />
    <p className="text-sm">Vystavení: {s.previewIssueDate} · Splatnost: {s.previewDueDate} · Datum plnění: {s.previewTaxableSupplyDate || 'Neuvedeno'}</p>
    {owned && !closed && <div className="flex flex-wrap gap-2">
      {allowed && <><Button disabled={busy} onClick={() => { setMode('upload'); setConfirmed(false); }}>Nahrát vlastní PDF</Button><Button disabled={busy} variant="outline" onClick={() => setMode('self')}>Vystavit mým jménem</Button></>}
      {s.status !== 'document_pending' && !issueJob && <Button disabled={busy} variant="outline" onClick={() => onCommand(makeBillingCommand({ kind: 'refresh', statementId: s.id, expectedUpdatedAt: s.updatedAt }))}>Obnovit údaje a data náhledu</Button>}
      <Button variant="link" onClick={onBillingSettings}>Nastavení → Fakturace</Button>
    </div>}
    {owned && allowed && mode === 'self' && <div className="space-y-3 rounded-xl border p-4"><p>Vystavení jedné faktury vaším jménem podle tohoto přesného náhledu. Zkontrolujte dodavatele, koncového odběratele, částky a data výše.</p>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} /><span>Prohlašuji, že nejsem plátcem DPH, a souhlasím s vystavením této konkrétní faktury mým jménem.</span></label>
      <Button disabled={busy || !confirmed} onClick={() => onCommand(makeBillingCommand({ kind: 'confirm', statementId: s.id, expectedUpdatedAt: s.updatedAt, nonVatConfirmed: confirmed }))}>Potvrdit a vystavit fakturu</Button></div>}
    {owned && allowed && mode === 'upload' && <BillingUploadForm statement={s} busy={busy} onCommand={onCommand} />}
    {!closed && scope.role === 'crewhead' && s.status === 'document_pending' && activeDocument && !activeDocument.decision && <div className="space-y-3 rounded-xl border p-4">
      <Button variant="outline" onClick={() => onDownload(activeDocument.storagePath)}>Otevřít aktivní originál PDF</Button>
      <label className="block">Důvod vrácení originálu<Input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="flex gap-2"><Button disabled={busy} onClick={() => review('accept')}>Přijmout originál</Button><Button variant="outline" disabled={busy || !note.trim()} onClick={() => review('return')}>Vrátit originál</Button></div>
    </div>}
    {!closed && scope.role === 'coo' && s.status === 'blocked' && <><BillingDistanceRepair statement={s} busy={busy} onCommand={onCommand} />
      <Button disabled={busy} variant="outline" onClick={() => onCommand(makeBillingCommand({ kind: 'prepare', timelogIds: s.sources.map((x) => x.timelogId) }))}>Obnovit přesný podklad</Button></>}
    {ownDocuments.length > 0 && <details open={s.status === 'document_returned'}><summary>Historie originálů ({ownDocuments.length})</summary><ul className="space-y-2">{ownDocuments.map((doc) => <li key={doc.id}>
      <Button variant="link" onClick={() => onDownload(doc.storagePath)}>{doc.externalInvoiceNumber} · {doc.decision?.decision === 'accept' ? 'Přijatý originál' : doc.decision?.decision === 'return' ? 'Vrácený originál' : 'Čeká na kontrolu'}</Button>
      {doc.decision?.note && <p>{doc.decision.note}</p>}</li>)}</ul></details>}
    {!readOnly && jobs.filter((j) => j.statementId === s.id && j.canRetry && ['crew', 'coo'].includes(scope.role) && !s.supersededByStatementId && !s.needsSourceVerification).map((j) => <div key={j.id}><p>{j.failureCode === 'retry_budget_exhausted' || j.failureCode === 'lease_expired_budget' ? 'Automatické pokusy byly vyčerpány.' : 'Zpracování čeká na opakování.'}</p>
      <Button disabled={busy} variant="outline" onClick={() => onCommand(makeBillingCommand({ kind: 'retry', statementId: s.id, jobId: j.id, expectedUpdatedAt: s.updatedAt, expectedJobUpdatedAt: j.updatedAt }))}>{j.kind === 'pdf' ? 'Znovu zpracovat PDF stejné faktury' : 'Znovu zpracovat stejný podklad'}</Button></div>)}
  </article>;
}
