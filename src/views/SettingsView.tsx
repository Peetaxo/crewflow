import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Moon, Palette, Sun, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../app/providers/AuthProvider';
import { useAppContext } from '../context/AppContext';
import type { Contractor } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  getContractors,
  subscribeToCrewChanges,
  updateContractor,
} from '../features/crew/services/crew.service';

const SettingsView = () => {
  const { darkMode, setDarkMode, settingsSection, setSettingsSection } = useAppContext();
  const { currentProfileId, profile } = useAuth();
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
  const fallbackProfile = {
    name: profile ? `${profile.firstName} ${profile.lastName}`.trim() || profile.email : 'Můj profil',
    city: '',
    phone: '',
    email: profile?.email ?? '',
    ico: '',
    dic: '',
    bank: '',
    billingName: profile ? `${profile.firstName} ${profile.lastName}`.trim() || profile.email : '',
    billingStreet: '',
    billingZip: '',
    billingCity: '',
    billingCountry: 'Česká republika',
  };
  const hasContractorProfile = Boolean(me);
  const displayProfile = me ? profileForm : fallbackProfile;

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

  const openSection = (section: 'profile' | 'appearance') => {
    setIsEditingProfile(false);
    setSettingsSection(section);
  };

  const saveProfile = () => {
    if (!me) return;
    updateContractor({
      ...me,
      ...profileForm,
    });
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
      <div className="mb-6">
        <div className="nodu-dashboard-kicker">Workspace Preferences</div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Nastavení</h1>
      </div>

      {settingsSection === 'menu' && (
        <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          {settingsCards.map((card) => (
            <Card
              key={card.id}
              className="cursor-pointer text-left transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.24)] hover:shadow-[0_22px_48px_rgba(47,38,31,0.12)]"
            >
              <button onClick={() => openSection(card.id)} className="h-full w-full p-0 text-left">
                <CardHeader>
                  <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]">
                    <card.icon size={18} />
                  </div>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </button>
            </Card>
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
            className="inline-flex items-center gap-2 text-sm text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-accent)]"
          >
            <ArrowLeft size={16} />
            Zpět do nastavení
          </button>

          {!isEditingProfile ? (
            <div className="space-y-5">
              {!hasContractorProfile && (
                <Card className="max-w-3xl border-[color:rgb(var(--nodu-accent-rgb)/0.18)]">
                  <CardHeader>
                    <CardTitle className="text-lg">Profil ještě není plně napojený</CardTitle>
                    <CardDescription>
                      Základní údaje načítáme z přihlášení. Fakturační data se zobrazí, jakmile bude k profilu přiřazen contractor záznam.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
                <Card>
                  <CardContent className="p-5">
                  <div className="mb-4 flex items-center gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-4">
                    <div className="av h-12 w-12 text-lg" style={{ backgroundColor: me?.bg ?? '#FFF1E3', color: me?.fg ?? '#FF800D' }}>{me?.ii ?? 'NP'}</div>
                    <div>
                      <div className="text-base font-semibold text-[color:var(--nodu-text)]">{displayProfile.name}</div>
                      <div className="text-xs text-[color:var(--nodu-text-soft)]">{displayProfile.city || 'Profil nodu.'}</div>
                    </div>
                  </div>

                  <h2 className="mb-3 text-sm font-semibold text-[color:var(--nodu-text)]">Osobní údaje</h2>
                  <div className="space-y-2">
                    {[
                      ['Telefon', displayProfile.phone || '—'],
                      ['E-mail', displayProfile.email || '—'],
                      ['IČO', displayProfile.ico || '—'],
                      ['DIČ', displayProfile.dic || '—'],
                      ['Č. účtu', displayProfile.bank || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] py-1.5 last:border-0">
                        <span className="text-xs text-[color:var(--nodu-text-soft)]">{label}</span>
                        <span className="text-right text-xs font-semibold text-[color:var(--nodu-text)]">{value}</span>
                      </div>
                    ))}
                  </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                  <div className="mb-4 border-b border-transparent pb-4">
                    <div className="h-12" aria-hidden="true" />
                  </div>

                  <h2 className="mb-3 text-sm font-semibold text-[color:var(--nodu-text)]">Fakturační adresa</h2>
                  <div className="space-y-2">
                    {[
                      ['Jméno / firma', displayProfile.billingName || '—'],
                      ['Ulice a číslo', displayProfile.billingStreet || '—'],
                      ['PSČ', displayProfile.billingZip || '—'],
                      ['Město', displayProfile.billingCity || '—'],
                      ['Stát', displayProfile.billingCountry || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] py-1.5 last:border-0">
                        <span className="text-xs text-[color:var(--nodu-text-soft)]">{label}</span>
                        <span className="text-right text-xs font-semibold text-[color:var(--nodu-text)]">{value}</span>
                      </div>
                    ))}
                  </div>
                  </CardContent>
                </Card>
              </div>

              {hasContractorProfile && (
                <div className="flex justify-end">
                <Button
                  onClick={() => setIsEditingProfile(true)}
                  className="min-w-[120px]"
                >
                  Upravit
                </Button>
                </div>
              )}
            </div>
          ) : (
            <Card className="max-w-4xl">
              <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-xs text-[color:var(--nodu-text-soft)]">Jméno
                  <Input value={profileForm.name} onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)]">Město
                  <Input value={profileForm.city} onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)]">Telefon
                  <Input value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)]">E-mail
                  <Input value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)]">IČO
                  <Input value={profileForm.ico} onChange={(e) => setProfileForm((prev) => ({ ...prev, ico: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)]">DIČ
                  <Input value={profileForm.dic} onChange={(e) => setProfileForm((prev) => ({ ...prev, dic: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)] md:col-span-2">Číslo účtu
                  <Input value={profileForm.bank} onChange={(e) => setProfileForm((prev) => ({ ...prev, bank: e.target.value }))} className="mt-1" />
                </label>
              </div>

              <h2 className="mb-4 mt-8 text-sm font-semibold text-[color:var(--nodu-text)]">Fakturační adresa</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-xs text-[color:var(--nodu-text-soft)] md:col-span-2">Fakturační jméno / firma
                  <Input value={profileForm.billingName} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingName: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)] md:col-span-2">Ulice a číslo
                  <Input value={profileForm.billingStreet} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingStreet: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)]">PSČ
                  <Input value={profileForm.billingZip} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingZip: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)]">Město
                  <Input value={profileForm.billingCity} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingCity: e.target.value }))} className="mt-1" />
                </label>
                <label className="text-xs text-[color:var(--nodu-text-soft)] md:col-span-2">Stát
                  <Input value={profileForm.billingCountry} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingCountry: e.target.value }))} className="mt-1" />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <Button
                  onClick={() => setIsEditingProfile(false)}
                  variant="outline"
                >
                  Zrušit
                </Button>
                <Button
                  onClick={saveProfile}
                >
                  Uložit
                </Button>
              </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {settingsSection === 'appearance' && (
        <div className="max-w-md space-y-5">
          <button
            onClick={() => setSettingsSection('menu')}
            className="inline-flex items-center gap-2 text-sm text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-accent)]"
          >
            <ArrowLeft size={16} />
            Zpět do nastavení
          </button>

          <Card>
            <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[color:var(--nodu-text)]">Tmavý režim</div>
                <p className="mt-0.5 text-xs text-[color:var(--nodu-text-soft)]">Přepnout vzhled aplikace</p>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`rounded-xl border p-2 transition-colors ${darkMode ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-accent-rgb)/0.14)] text-[color:var(--nodu-accent)]' : 'border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] text-[color:var(--nodu-text-soft)]'}`}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
};

export default SettingsView;
