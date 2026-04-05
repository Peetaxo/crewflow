import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';

/** Potvrzovací dialog pro smazání */
const DeleteConfirmModal = () => {
  const { deleteConfirm, setDeleteConfirm, handleDelete } = useAppContext();

  return (
    <AnimatePresence>
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Potvrdit smazání</h3>
              <button onClick={() => setDeleteConfirm(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600">
                Opravdu chcete smazat <strong>{deleteConfirm.name}</strong>? Tuto akci nelze vrátit zpět.
              </p>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white"
              >
                Zrušit
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700"
              >
                Smazat
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DeleteConfirmModal;
