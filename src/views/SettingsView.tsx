import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';

const SettingsView = () => {
  const { darkMode, setDarkMode } = useAppContext();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="text-lg font-semibold mb-5">Nastavení</h1>
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Tmavý režim</div>
            <p className="text-xs text-gray-500 mt-0.5">Přepnout vzhled aplikace</p>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-gray-800 text-amber-400' : 'bg-gray-100 text-gray-600'}`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsView;
