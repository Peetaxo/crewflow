import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../context/AppContext';
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
  getInvoices,
  getPendingInvoiceBatchCount,
  sendInvoice,
  subscribeToInvoiceChanges,
} from '../features/invoices/services/invoices.service';

interface InvoicesViewProps {
  scope?: 'all' | 'mine';
}

const InvoicesView = ({ scope = 'all' }: InvoicesViewProps) => {
  const { role, searchQuery, setNavigationGuardMessage } = useAppContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [pendingBatchCount, setPendingBatchCount] = useState(0);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [hasUnsavedCreate, setHasUnsavedCreate] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const loadData = useCallback(() => {
    setInvoices(getInvoices(searchQuery) ?? []);
    const dependencies = getInvoiceDependencies();
    setContractors(dependencies.contractors ?? []);
    setEvents(dependencies.events ?? []);
    setPendingBatchCount(getPendingInvoiceBatchCount());
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToInvoiceChanges(loadData), [loadData]);

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

  const findContractor = useCallback((id: number) => (
    contractors.find((contractor) => contractor.id === id) ?? null
  ), [contractors]);

  const findEvent = useCallback((id: number) => (
    events.find((event) => event.id === id) ?? null
  ), [events]);

  const visibleInvoices = scope === 'mine'
    ? invoices.filter((invoice) => invoice.cid === 1)
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
                className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
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
          <h1 className="text-lg font-semibold">{scope === 'mine' ? 'Moje faktury' : 'Faktury'}</h1>
          <p className="mt-0.5 text-xs text-gray-500">Self-billing system</p>
        </div>
        {!isCrew && pendingBatchCount > 0 ? (
          <button
            onClick={() => setIsCreateMode(true)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Vytvorit fakturu ({pendingBatchCount}) {'->'}
          </button>
        ) : (
          <StatusBadge status="approved" label="Self-billing bezi" />
        )}
      </div>

      <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-blue-800">
          <Info size={14} /> Self-billing je aktivni
        </div>
        <p className="text-[11px] leading-relaxed text-blue-700">
          Schvalene timelogy cekaji na vedome vytvoreni faktury. V seznamu nize vidis jen skutecne
          vytvorene faktury ve stavech draft, odeslano a zaplaceno.
        </p>
      </div>

      <div className="space-y-2">
        {visibleInvoices.map((invoice) => {
          const contractor = findContractor(invoice.cid);
          const event = invoice.eid ? findEvent(invoice.eid) : null;
          if (!contractor) return null;
          const countdown = invoice.status === 'sent' ? getCountdown(invoice.sentAt) : null;

          return (
            <div key={invoice.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{invoice.id}</span>
                    <span className="jn">{invoice.job}</span>
                    <StatusBadge status={invoice.status} />
                    {countdown && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${countdown.exp ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        ⏱ {countdown.text}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="av h-6 w-6 text-[9px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                      {contractor.ii}
                    </div>
                    <span className="text-xs font-medium">{contractor.name}</span>
                    <span className="text-xs text-gray-500">· {event ? event.name : 'Vice akci'}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-gray-600">
                      <span className="font-semibold text-gray-800">Hodiny</span>
                      <span>{` ${invoice.hours}h x ${Math.round(invoice.hAmt / Math.max(invoice.hours, 1))} Kc/h = ${formatCurrency(invoice.hAmt)}`}</span>
                    </div>
                    {(invoice.receiptAmt || 0) > 0 && (
                      <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-700">
                        <span className="font-semibold text-amber-900">Uctenky</span>
                        <span>{` = ${formatCurrency(invoice.receiptAmt || 0)}`}</span>
                      </div>
                    )}
                    {invoice.km > 0 && (
                      <div className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-blue-700">
                        <span className="font-semibold text-blue-900">Cestovne</span>
                        <span>{` ${invoice.km} km = ${formatCurrency(invoice.kAmt)}`}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-semibold">{formatCurrency(invoice.total)}</div>
                  <div className="mt-1 text-[10px] text-gray-500">
                    {invoice.sentAt ? formatShortDate(invoice.sentAt) : 'Zatim neodeslano'}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button className="rounded-md border border-gray-200 px-3 py-1 text-[11px] hover:bg-gray-50">
                  PDF ke stazeni
                </button>

                {invoice.status === 'draft' && !isCrew && (
                  <>
                    <button
                      onClick={() => handleDeleteInvoice(invoice.id)}
                      className="rounded-md border border-red-200 px-3 py-1 text-[11px] text-red-700 hover:bg-red-50"
                    >
                      Smazat draft
                    </button>
                    <button
                      onClick={() => handleSendInvoice(invoice.id)}
                      className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-[11px] text-white hover:bg-blue-700"
                    >
                      Odeslat fakturu {'->'}
                    </button>
                  </>
                )}

                {invoice.status === 'sent' && !isCrew && (
                  <button
                    onClick={() => handleMarkPaid(invoice.id)}
                    className="ml-auto rounded-md bg-emerald-600 px-3 py-1 text-[11px] text-white hover:bg-emerald-700"
                  >
                    Oznacit jako zaplacene {'->'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {visibleInvoices.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">
            Zatim zadne faktury
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default InvoicesView;
