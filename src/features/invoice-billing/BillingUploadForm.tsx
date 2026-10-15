import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { billingDate, type BillingStatement } from './contract';
import { makeBillingCommand, type BillingCommand } from './service';
export function BillingUploadForm({ statement, busy, onCommand }: { statement: BillingStatement; busy: boolean; onCommand: (command: BillingCommand) => void }) {
  const [file, setFile] = useState<File | null>(null); const [number, setNumber] = useState('');
  const [issue, setIssue] = useState(statement.previewIssueDate); const [due, setDue] = useState(statement.previewDueDate);
  const valid = Boolean(file && file.type === 'application/pdf' && file.size > 0 && file.size <= 5242880 && number.trim()
    && billingDate.safeParse(issue).success && billingDate.safeParse(due).success && due >= issue);
  return <form className="grid gap-3 rounded-xl border p-4" onSubmit={(e) => { e.preventDefault(); if (valid && file) onCommand(makeBillingCommand({ kind: 'upload',
    statementId: statement.id, expectedUpdatedAt: statement.updatedAt, file, invoiceNumber: number.trim(), issueDate: issue, dueDate: due })); }}>
    <p>{statement.status === 'document_returned' ? 'Nahrajte novou verzi originálu; předchozí zůstane v historii.' : 'Originál PDF do 5 MiB. Částku určuje schválený podklad.'}</p>
    <label>Číslo originální faktury<Input value={number} onChange={(e) => setNumber(e.target.value)} disabled={busy} /></label>
    <label>Datum vystavení<Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} disabled={busy} /></label>
    <label>Datum splatnosti<Input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={busy} /></label>
    <label>Originál faktury PDF<Input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} /></label>
    <Button type="submit" disabled={busy || !valid}>Nahrát originál ke kontrole CH</Button>
  </form>;
}
