import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Moon, Palette, Sun, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import type { Contractor } from '../types';
import {
  getContractors,
  subscribeToCrewChanges,
  updateContractor,
} from '../features/crew/services/crew.service';

const SettingsView = () => {
  const { darkMode, setDarkMode, settingsSection, setSettingsSection } = useAppContext();
  const { currentProfileId } = useAuth();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: '',
    city: '',
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    billingName: '',
    billingStreet: '',
    billingZip: '',
    billingCity: '',
    billingCountry: '',
  });

  const loadData = useCallback(() => {
    setContractors(getContractors() ?? []);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToCrewChanges(loadData), [loadData]);

  const me = contractors.find((item) => item.profileId === currentProfileId) ?? null;

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

  const saveProfile = async () => {
    try {
      await updateContractor({
        ...me,
        ...profileForm,
      });
      setIsEditingProfile(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Profil se nepodarilo ulozit.');
    }
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
      <h1 className="mb-5 text-lg font-semibold">Nastavení</h1>

      {settingsSection === 'menu' && (
        <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          {settingsCards.map((card) => (
            <button
              key={card.id}
              onClick={() => openSection(card.id)}
              className="rounded-xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <card.icon size={18} />
              </div>
              <div className="text-base font-semibold text-gray-900">{card.title}</div>
              <div className="mt-1 text-sm text-gray-500">{card.description}</div>
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
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3 border-b border-gray-50 pb-4">
                    <div className="av h-12 w-12 text-lg" style={{ backgroundColor: me.bg, color: me.fg }}>{me.ii}</div>
                    <div>
                      <div className="text-base font-semibold">{profileForm.name}</div>
                      <div className="text-xs text-gray-500">{profileForm.city}</div>
                    </div>
                  </div>

                  <h2 className="mb-3 text-sm font-semibold">Osobní údaje</h2>
                  <div className="space-y-2">
                    {[
                      ['Telefon', profileForm.phone],
                      ['E-mail', profileForm.email],
                      ['IČO', profileForm.ico],
                      ['DIČ', profileForm.dic || '—'],
                      ['Č. účtu', profileForm.bank],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 border-b border-gray-50 py-1.5 last:border-0">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className="text-right text-xs font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 border-b border-transparent pb-4">
                    <div className="h-12" aria-hidden="true" />
                  </div>

                  <h2 className="mb-3 text-sm font-semibold">Fakturační adresa</h2>
                  <div className="space-y-2">
                    {[
                      ['Jméno / firma', profileForm.billingName],
                      ['Ulice a číslo', profileForm.billingStreet || '—'],
                      ['PSČ', profileForm.billingZip || '—'],
                      ['Město', profileForm.billingCity || '—'],
                      ['Stát', profileForm.billingCountry || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 border-b border-gray-50 py-1.5 last:border-0">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className="text-right text-xs font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Upravit
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              </div>

              <h2 className="mb-4 mt-8 text-sm font-semibold">Fakturační adresa</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={saveProfile}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Uložit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {settingsSection === 'appearance' && (
        <div className="max-w-md space-y-5">
          <button
            onClick={() => setSettingsSection('menu')}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            Zpět do nastavení
          </button>

          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Tmavý režim</div>
                <p className="mt-0.5 text-xs text-gray-500">Přepnout vzhled aplikace</p>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`rounded-lg p-2 transition-colors ${darkMode ? 'bg-gray-800 text-amber-400' : 'bg-gray-100 text-gray-600'}`}
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
