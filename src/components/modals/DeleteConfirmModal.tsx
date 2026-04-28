import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import { useAppContext } from '../../context/useAppContext';

/** Potvrzovací dialog pro smazání */
const DeleteConfirmModal = () => {
  const { deleteConfirm, setDeleteConfirm, handleDelete } = useAppContext();

  return (
    <AnimatePresence>
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-sm overflow-hidden rounded-[24px] border border-[var(--nodu-border)] bg-white shadow-[var(--nodu-shadow)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--nodu-border)] p-4">
              <h3 className="font-semibold text-[var(--nodu-text)]">Potvrdit smazání</h3>
              <button onClick={() => setDeleteConfirm(null)} className="rounded-full p-1.5 text-[var(--nodu-text-soft)] transition hover:bg-[var(--nodu-accent-soft)] hover:text-[var(--nodu-text)]">
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-[var(--nodu-text-soft)]">
                Opravdu chcete smazat <strong className="font-semibold text-[var(--nodu-text)]">{deleteConfirm.name}</strong>? Tuto akci nelze vrátit zpět.
              </p>
            </div>
            <div className="flex gap-3 border-t border-[var(--nodu-border)] bg-white p-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1"
              >
                Zrušit
              </Button>
              <Button
                type="button"
                onClick={handleDelete}
                className="flex-1 border border-[#df8c70] bg-[#d95833] text-white shadow-[0_14px_30px_rgba(217,88,51,0.18)] hover:bg-[#c94b28]"
              >
                Smazat
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DeleteConfirmModal;
