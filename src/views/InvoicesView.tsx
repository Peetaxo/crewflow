import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../app/providers/AuthProvider';
import { useAppContext } from '../context/AppContext';
import { Button } from '../components/ui/button';
import { Contractor, Event, Invoice } from '../types';
import { formatCurrency, formatShortDate, getCountdown } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import InvoiceCreateModal from '../components/modals/InvoiceCreateModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  approveInvoice,
  deleteInvoice,
  getInvoiceDependencies,
  getPendingInvoiceBatchCount,
  sendInvoice,
} from '../features/invoices/services/invoices.service';
import { useInvoicesQuery } from '../features/invoices/queries/useInvoicesQuery';

interface InvoicesViewProps {
  scope?: 'all' | 'mine';
}

const InvoicesView = ({ scope = 'all' }: InvoicesViewProps) => {
  const { currentProfileId } = useAuth();
  const { role, searchQuery, setNavigationGuardMessage } = useAppContext();
  const invoicesQuery = useInvoicesQuery();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [pendingBatchCount, setPendingBatchCount] = useState(0);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [hasUnsavedCreate, setHasUnsavedCreate] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const loadDependencies = useCallback(() => {
    const dependencies = getInvoiceDependencies();
    setContractors(dependencies.contractors ?? []);
    setEvents(dependencies.events ?? []);
    setPendingBatchCount(getPendingInvoiceBatchCount());
  }, []);

  useEffect(() => {
    loadDependencies();
  }, [invoicesQuery.data, loadDependencies]);

  useEffect(() => {
    setNavigationGuardMessage(
      isCreateMode && hasUnsavedCreate
        ? 'Mas rozpracovany vyber faktury. Pokud ted odejdes, neulozene zmeny se ztrati.'
        : null,
    );

    return () => {
      setNavigationGuardMessage(null);
    };
  }, [hasUnsavedCreate, isCreateMode, setNavigationGuardMessage]);

  const findContractor = useCallback((contractorProfileId?: string, contractorId?: number) => {
    if (contractorProfileId) {
      const contractorByProfileId = contractors.find((contractor) => contractor.profileId === contractorProfileId);
      if (contractorByProfileId) {
        return contractorByProfileId;
      }
    }

    if (contractorId == null) {
      return null;
    }

    return contractors.find((contractor) => contractor.id === contractorId) ?? null;
  }, [contractors]);

  const findEvent = useCallback((id: number) => (
    events.find((event) => event.id === id) ?? null
  ), [events]);

  const invoices = useMemo(() => {
    const safeInvoices = invoicesQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeInvoices;

    return safeInvoices.filter((invoice) => {
      const event = invoice.eid ? findEvent(invoice.eid) : null;
      const contractor = findContractor(invoice.contractorProfileId, invoice.cid);

      return (
        invoice.id.toLowerCase().includes(query)
        || invoice.job.toLowerCase().includes(query)
        || contractor?.name.toLowerCase().includes(query)
        || event?.name.toLowerCase().includes(query)
        || event?.job.toLowerCase().includes(query)
        || false
      );
    });
  }, [findContractor, findEvent, invoicesQuery.data, searchQuery]);

  const visibleInvoices = scope === 'mine'
    ? invoices.filter((invoice) => invoice.contractorProfileId === currentProfileId)
    : invoices;
  const isCrew = role === 'crew';

  const handleSendInvoice = async (invoiceId: string) => {
    try {
      await sendInvoice(invoiceId);
      toast.success('Faktura byla odeslana.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se odeslat fakturu.');
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const deleted = await deleteInvoice(invoiceId);
      if (deleted) {
        toast.success('Draft faktury byl smazan.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se smazat draft faktury.');
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      await approveInvoice(invoiceId);
      toast.success('Faktura byla oznacena jako zaplacena.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se uzavrit fakturu.');
    }
  };

  const requestCloseCreate = () => {
    if (hasUnsavedCreate) {
      setShowDiscardDialog(true);
      return;
    }

    setIsCreateMode(false);
  };

  const leaveCreateMode = () => {
    setShowDiscardDialog(false);
    setHasUnsavedCreate(false);
    setNavigationGuardMessage(null);
    setIsCreateMode(false);
  };

  if (isCreateMode) {
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                type="button"
                onClick={requestCloseCreate}
                className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--nodu-accent)] hover:opacity-80"
              >
                <ArrowLeft size={16} /> Zpet na faktury
              </button>
            </div>
            <StatusBadge status="draft" label="Rozpracovano" />
          </div>

          <InvoiceCreateModal
            onClose={requestCloseCreate}
            onDirtyChange={setHasUnsavedCreate}
          />
        </motion.div>

        <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rozpracovany vyber se neulozi</AlertDialogTitle>
              <AlertDialogDescription>
                Pokud se ted vratis zpet, neulozeny vyber faktury se ztrati.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zustat</AlertDialogCancel>
              <AlertDialogAction onClick={leaveCreateMode}>
                Odejit bez ulozeni
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Billing</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">{scope === 'mine' ? 'Moje faktury' : 'Faktury'}</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Self-billing system</p>
        </div>
        {!isCrew && pendingBatchCount > 0 ? (
          <Button
            onClick={() => setIsCreateMode(true)}
            size="sm"
            className="text-xs"
          >
            Vytvorit fakturu ({pendingBatchCount}) {'->'}
          </Button>
        ) : (
          <StatusBadge status="approved" label="Self-billing bezi" />
        )}
      </div>

      <div className="mb-4 rounded-[22px] border border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[color:var(--nodu-accent)]">
          <Info size={14} /> Self-billing je aktivni
        </div>
        <p className="text-[11px] leading-relaxed text-[color:var(--nodu-text-soft)]">
          Schvalene timelogy cekaji na vedome vytvoreni faktury. V seznamu nize vidis jen skutecne
          vytvorene faktury ve stavech draft, odeslano a zaplaceno.
        </p>
      </div>

      <div className="space-y-2">
        {visibleInvoices.map((invoice) => {
          const contractor = findContractor(invoice.contractorProfileId, invoice.cid);
          const event = invoice.eid ? findEvent(invoice.eid) : null;
          if (!contractor) return null;
          const countdown = invoice.status === 'sent' ? getCountdown(invoice.sentAt) : null;

          return (
            <div key={invoice.id} className="nodu-panel rounded-[28px] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[color:var(--nodu-text)]">{invoice.id}</span>
                    <span className="jn nodu-job-badge">{invoice.job}</span>
                    <StatusBadge status={invoice.status} />
                    {countdown && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${countdown.exp ? 'bg-[rgba(212,93,55,0.12)] text-[#c45c39]' : 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]'}`}>
                        ⏱ {countdown.text}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="av h-6 w-6 text-[9px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                      {contractor.ii}
                    </div>
                    <span className="text-xs font-medium text-[color:var(--nodu-text)]">{contractor.name}</span>
                    <span className="text-xs text-[color:var(--nodu-text-soft)]">· {event ? event.name : 'Vice akci'}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <div className="rounded-[16px] bg-[color:rgb(var(--nodu-text-rgb)/0.05)] px-2.5 py-1.5 text-[color:var(--nodu-text-soft)]">
                      <span className="font-semibold text-[color:var(--nodu-text)]">Hodiny</span>
                      <span>{` ${invoice.hours}h x ${Math.round(invoice.hAmt / Math.max(invoice.hours, 1))} Kc/h = ${formatCurrency(invoice.hAmt)}`}</span>
                    </div>
                    {(invoice.receiptAmt || 0) > 0 && (
                      <div className="rounded-[16px] bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] px-2.5 py-1.5 text-[color:var(--nodu-accent)]">
                        <span className="font-semibold text-[color:var(--nodu-text)]">Uctenky</span>
                        <span>{` = ${formatCurrency(invoice.receiptAmt || 0)}`}</span>
                      </div>
                    )}
                    {invoice.km > 0 && (
                      <div className="rounded-[16px] bg-[color:rgb(var(--nodu-text-rgb)/0.05)] px-2.5 py-1.5 text-[color:var(--nodu-text-soft)]">
                        <span className="font-semibold text-[color:var(--nodu-text)]">Cestovne</span>
                        <span>{` ${invoice.km} km = ${formatCurrency(invoice.kAmt)}`}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-semibold text-[color:var(--nodu-text)]">{formatCurrency(invoice.total)}</div>
                  <div className="mt-1 text-[10px] text-[color:var(--nodu-text-soft)]">
                    {invoice.sentAt ? formatShortDate(invoice.sentAt) : 'Zatim neodeslano'}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="text-[11px]">
                  PDF ke stazeni
                </Button>

                {invoice.status === 'draft' && !isCrew && (
                  <>
                    <Button
                      onClick={() => handleDeleteInvoice(invoice.id)}
                      variant="outline"
                      size="sm"
                      className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
                    >
                      Smazat draft
                    </Button>
                    <Button
                      onClick={() => handleSendInvoice(invoice.id)}
                      className="ml-auto text-[11px]"
                      size="sm"
                    >
                      Odeslat fakturu {'->'}
                    </Button>
                  </>
                )}

                {invoice.status === 'sent' && !isCrew && (
                  <Button
                    onClick={() => handleMarkPaid(invoice.id)}
                    className="ml-auto border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_10px_24px_rgba(45,108,78,0.1)] hover:bg-[color:var(--nodu-success-bg-hover)]"
                    size="sm"
                  >
                    Oznacit jako zaplacene {'->'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {visibleInvoices.length === 0 && (
          <div className="rounded-[24px] border border-[color:var(--nodu-border)] bg-white p-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
            Zatim zadne faktury
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default InvoicesView;
