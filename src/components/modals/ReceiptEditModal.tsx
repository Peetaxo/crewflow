import React from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAppContext } from '../../context/AppContext';
import { getReceiptDependencies, saveReceipt } from '../../features/receipts/services/receipts.service';

const ReceiptEditModal = () => {
  const {
    role,
    editingReceipt,
    setEditingReceipt,
  } = useAppContext();

  if (!editingReceipt) return null;

  const { events, contractors } = getReceiptDependencies();
  const selectedEvent = events.find((event) => event.id === editingReceipt.eid);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900">{editingReceipt.title ? 'Upravit ĂşÄŤtenku' : 'NovĂˇ ĂşÄŤtenka'}</h3>
            <button onClick={() => setEditingReceipt(null)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {role !== 'crew' && (
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Crew</label>
                <select
                  value={editingReceipt.cid}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, cid: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  {contractors.map((contractor) => (
                    <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Akce</label>
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
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value={0}>Vyberte akci</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.job} - {event.name}
                  </option>
                ))}
              </select>
              {selectedEvent && (
                <div className="mt-1 text-[11px] text-gray-500">
                  Projekt {selectedEvent.job} Â· {selectedEvent.client}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">NĂˇzev</label>
                <input
                  type="text"
                  value={editingReceipt.title}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  placeholder="NapĹ™Ă­klad parkovnĂ©"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Dodavatel</label>
                <input
                  type="text"
                  value={editingReceipt.vendor}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, vendor: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  placeholder="Bolt, Shell, Hornbach..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">ÄŚĂˇstka</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editingReceipt.amount || ''}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, amount: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">Datum platby</label>
                <input
                  type="date"
                  value={editingReceipt.paidAt}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, paidAt: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-500">PoznĂˇmka</label>
              <textarea
                value={editingReceipt.note}
                onChange={(e) => setEditingReceipt({ ...editingReceipt, note: e.target.value })}
                className="h-20 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                placeholder="Co bylo zaplaceno a proÄŤ"
              />
            </div>
          </div>

          <div className="flex gap-3 border-t border-gray-100 bg-gray-50 p-4">
            <button
              onClick={() => setEditingReceipt(null)}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-white"
            >
              ZruĹˇit
            </button>
            <button
              onClick={() => {
                try {
                  saveReceipt(editingReceipt);
                  setEditingReceipt(null);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit uctenku.');
                }
              }}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              UloĹľit ĂşÄŤtenku
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReceiptEditModal;
