import React from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../../context/useAppContext';
import { getReceiptDependencies, saveReceipt } from '../../features/receipts/services/receipts.service';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

const ReceiptEditModal = () => {
  const {
    role,
    editingReceipt,
    setEditingReceipt,
  } = useAppContext();

  if (!editingReceipt) return null;

  const { events, contractors } = getReceiptDependencies();
  const selectedEvent = events.find((event) => event.id === editingReceipt.eid);
  const selectedContractorValue = editingReceipt.contractorProfileId ?? String(editingReceipt.cid);
  const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--nodu-text-soft)]';
  const selectClass = 'h-10 w-full rounded-xl border border-[var(--nodu-border)] bg-white px-3 text-sm text-[var(--nodu-text)] outline-none transition focus:border-[var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-[var(--nodu-border)] bg-white shadow-[var(--nodu-shadow)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--nodu-border)] p-4">
            <h3 className="font-semibold text-[var(--nodu-text)]">{editingReceipt.title ? 'Upravit účtenku' : 'Nová účtenka'}</h3>
            <button onClick={() => setEditingReceipt(null)} className="rounded-full p-1.5 text-[var(--nodu-text-soft)] transition hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {role !== 'crew' && (
              <div>
                <label className={labelClass}>Crew</label>
                <select
                  aria-label="Crew"
                  value={selectedContractorValue}
                  onChange={(e) => {
                    const contractor = contractors.find((item) => item.profileId === e.target.value);
                    if (!contractor) return;

                    setEditingReceipt({
                      ...editingReceipt,
                      contractorProfileId: contractor.profileId,
                    });
                  }}
                  className={selectClass}
                >
                  {contractors.map((contractor) => (
                    <option
                      key={contractor.id}
                      value={contractor.profileId ?? ''}
                      disabled={!contractor.profileId}
                    >
                      {contractor.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={labelClass}>Akce</label>
              <select
                value={editingReceipt.eid}
                onChange={(e) => {
                  const eid = Number(e.target.value);
                  const event = events.find((item) => item.id === eid);
                  setEditingReceipt({
                    ...editingReceipt,
                    eid,
                    job: event?.job || '',
                  });
                }}
                className={selectClass}
              >
                <option value={0}>Vyberte akci</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.job} - {event.name}
                  </option>
                ))}
              </select>
              {selectedEvent && (
                <div className="mt-1.5 text-[11px] text-[var(--nodu-text-soft)]">
                  Projekt <span className="font-mono text-[var(--nodu-accent)]">{selectedEvent.job}</span> · {selectedEvent.client}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Název</label>
                <Input
                  type="text"
                  value={editingReceipt.title}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, title: e.target.value })}
                  placeholder="Například parkovné"
                />
              </div>
              <div>
                <label className={labelClass}>Dodavatel</label>
                <Input
                  type="text"
                  value={editingReceipt.vendor}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, vendor: e.target.value })}
                  placeholder="Bolt, Shell, Hornbach..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Částka</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={editingReceipt.amount || ''}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass}>Datum platby</label>
                <Input
                  type="date"
                  value={editingReceipt.paidAt}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, paidAt: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Poznámka</label>
              <Textarea
                value={editingReceipt.note}
                onChange={(e) => setEditingReceipt({ ...editingReceipt, note: e.target.value })}
                className="h-20 resize-none"
                placeholder="Co bylo zaplaceno a proč"
              />
            </div>
          </div>

          <div className="flex gap-3 border-t border-[var(--nodu-border)] bg-white p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingReceipt(null)}
              className="flex-1"
            >
              Zrušit
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await saveReceipt(editingReceipt);
                  setEditingReceipt(null);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Nepodařilo se uložit účtenku.');
                }
              }}
              className="flex-1"
            >
              Uložit účtenku
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReceiptEditModal;
