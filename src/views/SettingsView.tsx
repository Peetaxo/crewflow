import React, { useEffect, useState } from 'react';
import { ArrowLeft, Moon, Sun, UserRound, Palette } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';

const SettingsView = () => {
  const { darkMode, setDarkMode, contractors, setContractors, settingsSection, setSettingsSection } = useAppContext();
  const me = contractors[0];
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: '',
    city: '',
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    note: '',
    billingName: '',
    billingStreet: '',
    billingZip: '',
    billingCity: '',
    billingCountry: '',
  });

  useEffect(() => {
    if (!me) return;
    setProfileForm({
      name: me.name,
      city: me.city,
      phone: me.phone,
      email: me.email,
      ico: me.ico,
      dic: me.dic,
      bank: me.bank,
      note: me.note,
      billingName: me.billingName ?? me.name,
      billingStreet: me.billingStreet ?? '',
      billingZip: me.billingZip ?? '',
      billingCity: me.billingCity ?? me.city,
      billingCountry: me.billingCountry ?? 'Česká republika',
    });
  }, [me]);

  if (!me) return null;

  const openSection = (section: 'profile' | 'appearance') => {
    setIsEditingProfile(false);
    setSettingsSection(section);
  };

  const saveProfile = () => {
    setContractors((prev) => prev.map((contractor, index) => (
      index === 0 ? { ...contractor, ...profileForm } : contractor
    )));
    setIsEditingProfile(false);
  };

  const settingsCards = [
    {
      id: 'profile' as const,
      title: 'Profil',
      description: 'Osobní údaje a fakturační adresa.',
      icon: UserRound,
    },
    {
      id: 'appearance' as const,
      title: 'Vzhled',
      description: 'Tmavý režim a další nastavení zobrazení.',
      icon: Palette,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="text-lg font-semibold mb-5">Nastavení</h1>

      {settingsSection === 'menu' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          {settingsCards.map((card) => (
            <button
              key={card.id}
              onClick={() => openSection(card.id)}
              className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm text-left hover:shadow-md hover:border-emerald-200 transition-all"
            >
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 mb-4">
                <card.icon size={18} />
              </div>
              <div className="text-base font-semibold text-gray-900">{card.title}</div>
              <div className="text-sm text-gray-500 mt-1">{card.description}</div>
            </button>
          ))}
        </div>
      )}

      {settingsSection === 'profile' && (
        <div className="space-y-5">
          <button
            onClick={() => {
              setIsEditingProfile(false);
              setSettingsSection('menu');
            }}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            Zpět do nastavení
          </button>

          {!isEditingProfile ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-50">
                    <div className="av w-12 h-12 text-lg" style={{ backgroundColor: me.bg, color: me.fg }}>{me.ii}</div>
                    <div>
                      <div className="text-base font-semibold">{profileForm.name}</div>
                      <div className="text-xs text-gray-500">{profileForm.city}</div>
                    </div>
                  </div>
                  <h2 className="text-sm font-semibold mb-3">Osobní údaje</h2>
                  <div className="space-y-2">
                    {[
                      ['Telefon', profileForm.phone],
                      ['E-mail', profileForm.email],
                      ['IČO', profileForm.ico],
                      ['DIČ', profileForm.dic || '—'],
                      ['Č. účtu', profileForm.bank],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className="text-xs font-semibold text-right">{value}</span>
                      </div>
                    ))}
                  </div>
                  {profileForm.note && (
                    <div className="mt-4 pt-4 border-t border-gray-50">
                      <div className="text-xs text-gray-500 mb-1">Poznámka</div>
                      <div className="text-sm text-gray-700">{profileForm.note}</div>
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                  <h2 className="text-sm font-semibold mb-3">Fakturační adresa</h2>
                  <div className="space-y-2">
                    {[
                      ['Jméno / firma', profileForm.billingName],
                      ['Ulice a číslo', profileForm.billingStreet || '—'],
                      ['PSČ', profileForm.billingZip || '—'],
                      ['Město', profileForm.billingCity || '—'],
                      ['Stát', profileForm.billingCountry || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className="text-xs font-semibold text-right">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  Upravit
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-xs text-gray-600">Jméno
                  <input value={profileForm.name} onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">Město
                  <input value={profileForm.city} onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">Telefon
                  <input value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">E-mail
                  <input value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">IČO
                  <input value={profileForm.ico} onChange={(e) => setProfileForm((prev) => ({ ...prev, ico: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">DIČ
                  <input value={profileForm.dic} onChange={(e) => setProfileForm((prev) => ({ ...prev, dic: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600 md:col-span-2">Číslo účtu
                  <input value={profileForm.bank} onChange={(e) => setProfileForm((prev) => ({ ...prev, bank: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600 md:col-span-2">Poznámka
                  <textarea value={profileForm.note} onChange={(e) => setProfileForm((prev) => ({ ...prev, note: e.target.value }))} rows={4} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
              </div>

              <h2 className="text-sm font-semibold mt-8 mb-4">Fakturační adresa</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-xs text-gray-600 md:col-span-2">Fakturační jméno / firma
                  <input value={profileForm.billingName} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingName: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600 md:col-span-2">Ulice a číslo
                  <input value={profileForm.billingStreet} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingStreet: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">PSČ
                  <input value={profileForm.billingZip} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingZip: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600">Město
                  <input value={profileForm.billingCity} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingCity: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-gray-600 md:col-span-2">Stát
                  <input value={profileForm.billingCountry} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingCountry: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={saveProfile}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  Uložit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {settingsSection === 'appearance' && (
        <div className="space-y-5 max-w-md">
          <button
            onClick={() => setSettingsSection('menu')}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            Zpět do nastavení
          </button>

          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
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
        </div>
      )}
    </motion.div>
  );
};

export default SettingsView;
