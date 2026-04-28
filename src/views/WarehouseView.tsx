import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Package, Search, ShoppingCart, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  createWarehouseReservation,
  getWarehouseCatalogRows,
  getWarehouseDependencies,
  subscribeToWarehouseChanges,
} from '../features/warehouse/services/warehouse.service';
import type { WarehouseCatalogRow } from '../features/warehouse/services/warehouse.service';
import type { Event, Project, WarehouseCartItemDraft } from '../types';

const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-text-soft)]';
const selectClass = 'h-10 w-full rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] px-3 text-sm text-[color:var(--nodu-text)] outline-none transition focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]';
const panelClass = 'rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)]';

const formatPrice = (priceCents: number) => `${Math.round(priceCents / 100).toLocaleString('cs-CZ').replace(/\u00a0/g, ' ')} Kc`;

const padDatePart = (value: number) => String(value).padStart(2, '0');

const formatDateTimeLocal = (date: Date) => [
  date.getFullYear(),
  padDatePart(date.getMonth() + 1),
  padDatePart(date.getDate()),
].join('-') + `T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;

const getDefaultStart = () => {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return formatDateTimeLocal(date);
};

const getDefaultEnd = (startsAt: string) => {
  const date = new Date(startsAt);
  date.setHours(date.getHours() + 8);
  return formatDateTimeLocal(date);
};

const getProjectLabel = (project: Project) => `${project.id} - ${project.name}`;
const getEventLabel = (event: Event) => `${event.name} - ${event.startDate}`;

const getCartQuantity = (cartItems: WarehouseCartItemDraft[], warehouseItemId: string) => (
  cartItems
    .filter((item) => item.warehouseItemId === warehouseItemId)
    .reduce((sum, item) => sum + item.quantity, 0)
);

const getCartCountLabel = (count: number) => {
  if (count === 1) return '1 polozka';
  if (count > 1 && count < 5) return `${count} polozky`;
  return `${count} polozek`;
};

const WarehouseView: React.FC = () => {
  const [, setVersion] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [eventLocalId, setEventLocalId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [cartItems, setCartItems] = useState<WarehouseCartItemDraft[]>([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => subscribeToWarehouseChanges(reload), [reload]);

  const dependencies = getWarehouseDependencies();
  const range = startsAt && endsAt ? { startsAt, endsAt } : undefined;
  const rows = getWarehouseCatalogRows(range);
  const selectedProject = dependencies.projects.find((project) => project.id === projectId) ?? null;
  const selectedEvent = dependencies.events.find((event) => String(event.id) === eventLocalId) ?? null;
  const eventsForProject = selectedProject
    ? dependencies.events.filter((event) => event.job === selectedProject.id || event.projectId === selectedProject.id)
    : dependencies.events;

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter(({ item }) => (
      item.name.toLowerCase().includes(normalizedQuery)
      || (item.category ?? '').toLowerCase().includes(normalizedQuery)
    ));
  }, [query, rows]);

  useEffect(() => {
    setCartItems((current) => {
      let changed = false;
      const nextItems = current.map((cartItem) => {
        const row = rows.find((candidate) => candidate.item.id === cartItem.warehouseItemId);

        if (!row || !row.isAvailable || row.availableQuantity <= 0) {
          changed = true;
          return null;
        }

        const quantity = Math.min(cartItem.quantity, row.availableQuantity);
        if (quantity !== cartItem.quantity) changed = true;

        return { ...cartItem, quantity };
      }).filter((item): item is WarehouseCartItemDraft => item !== null);

      return changed ? nextItems : current;
    });
  }, [rows]);

  const cartDetails = cartItems.map((cartItem) => {
    const row = rows.find((candidate) => candidate.item.id === cartItem.warehouseItemId);
    return row ? { ...row, quantity: cartItem.quantity } : null;
  }).filter((item): item is WarehouseCatalogRow & { quantity: number } => item !== null);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalCents = cartDetails.reduce((sum, row) => sum + (row.item.priceCents * row.quantity), 0);

  const handleProjectChange = (value: string) => {
    setProjectId(value);
    setEventLocalId('');
    setMessage('');
  };

  const addToCart = (row: WarehouseCatalogRow) => {
    if (!row.isAvailable) return;

    setCartItems((current) => {
      const existingQuantity = getCartQuantity(current, row.item.id);
      if (existingQuantity >= row.availableQuantity) return current;

      const existing = current.find((item) => item.warehouseItemId === row.item.id);
      if (!existing) return [...current, { warehouseItemId: row.item.id, quantity: 1 }];

      return current.map((item) => (
        item.warehouseItemId === row.item.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    });
    setMessage('');
  };

  const removeFromCart = (warehouseItemId: string) => {
    setCartItems((current) => current.filter((item) => item.warehouseItemId !== warehouseItemId));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setMessage('');

    try {
      await createWarehouseReservation({
        projectId: selectedProject?.id ?? null,
        projectJobNumber: selectedProject?.id ?? '',
        eventId: selectedEvent?.supabaseId ?? null,
        eventLocalId: selectedEvent?.id ?? null,
        startsAt,
        endsAt,
        note,
        items: cartItems,
      });

      setCartItems([]);
      setNote('');
      setMessageTone('success');
      setMessage('Rezervace byla vytvorena.');
      toast.success('Rezervace byla vytvorena.');
      reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Rezervaci se nepodarilo vytvorit.';
      setMessageTone('error');
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyDefaultDates = () => {
    const nextStart = startsAt || getDefaultStart();
    setStartsAt(nextStart);
    setEndsAt(endsAt || getDefaultEnd(nextStart));
  };

  return (
    <div className="nodu-dashboard-shell">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Warehouse</div>
          <h1 className="nodu-dashboard-heading">Sklad</h1>
          <p className="nodu-dashboard-lead">Vyberte vybaveni z importovaneho katalogu a vytvorte interni rezervaci.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] px-4 py-3 text-sm font-semibold text-[color:var(--nodu-text)]">
          <ShoppingCart size={17} className="text-[color:var(--nodu-accent)]" />
          Kosik: {cartCount}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <section className={`${panelClass} p-4`}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <label className={labelClass} htmlFor="warehouse-project">Projekt</label>
                <select
                  id="warehouse-project"
                  className={selectClass}
                  value={projectId}
                  onChange={(event) => handleProjectChange(event.target.value)}
                >
                  <option value="">Vyberte projekt</option>
                  {dependencies.projects.map((project) => (
                    <option key={project.id} value={project.id}>{getProjectLabel(project)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass} htmlFor="warehouse-event">Akce volitelne</label>
                <select
                  id="warehouse-event"
                  className={selectClass}
                  value={eventLocalId}
                  onChange={(event) => setEventLocalId(event.target.value)}
                >
                  <option value="">Bez akce</option>
                  {eventsForProject.map((event) => (
                    <option key={event.id} value={event.id}>{getEventLabel(event)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass} htmlFor="warehouse-start">Od</label>
                <Input
                  id="warehouse-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  onFocus={applyDefaultDates}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="warehouse-end">Do</label>
                <Input
                  id="warehouse-end"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  onFocus={applyDefaultDates}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className={labelClass} htmlFor="warehouse-search">Hledat</label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--nodu-text-soft)]" />
                <Input
                  id="warehouse-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nazev nebo kategorie"
                  className="pl-9"
                />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredRows.map((row) => {
              const quantityInCart = getCartQuantity(cartItems, row.item.id);
              const canAdd = row.isAvailable && quantityInCart < row.availableQuantity;

              return (
                <article
                  key={row.item.id}
                  className="overflow-hidden rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_14px_32px_rgba(47,38,31,0.07)]"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[color:rgb(var(--nodu-accent-rgb)/0.06)]">
                    {row.item.imageUrl ? (
                      <img
                        src={row.item.imageUrl}
                        alt={row.item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[color:var(--nodu-text-soft)]">
                        <Package size={34} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-[color:var(--nodu-accent)]">{row.item.category ?? 'Sklad'}</div>
                        <h2 className="mt-1 text-base font-semibold leading-tight text-[color:var(--nodu-text)]">{row.item.name}</h2>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${row.isAvailable ? 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {row.isAvailable ? `${row.availableQuantity} dostupne` : 'Nedostupne'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-bold text-[color:var(--nodu-text)]">{formatPrice(row.item.priceCents)}</div>
                        <div className="text-xs text-[color:var(--nodu-text-soft)]">{row.item.pricePeriodLabel ?? 'Bez periody'}</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canAdd}
                        aria-label={`Pridat do kosiku ${row.item.name}`}
                        onClick={() => addToCart(row)}
                      >
                        Pridat do kosiku
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </main>

        <aside className={`${panelClass} h-fit p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="nodu-dashboard-kicker">Rezervace</div>
              <h2 className="text-xl font-semibold text-[color:var(--nodu-text)]">Kosik</h2>
            </div>
            <span className="rounded-full border border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] px-3 py-1 text-xs font-bold text-[color:var(--nodu-accent)]">
              {getCartCountLabel(cartCount)}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {cartDetails.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--nodu-border)] p-4 text-sm text-[color:var(--nodu-text-soft)]">
                Kosik je prazdny.
              </div>
            ) : cartDetails.map((row) => (
              <div key={row.item.id} className="flex items-center gap-3 rounded-2xl border border-[color:var(--nodu-border)] p-3">
                {row.item.imageUrl && (
                  <img src={row.item.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[color:var(--nodu-text)]">{row.item.name}</div>
                  <div className="text-xs text-[color:var(--nodu-text-soft)]">
                    {row.quantity} x {formatPrice(row.item.priceCents)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Odebrat ${row.item.name}`}
                  onClick={() => removeFromCart(row.item.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--nodu-text-soft)] transition hover:bg-red-50 hover:text-red-700"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          <label className={`${labelClass} mt-5`} htmlFor="warehouse-note">Poznamka</label>
          <textarea
            id="warehouse-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-24 w-full rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition focus:ring-2 focus:ring-[color:var(--nodu-accent-soft)]"
          />

          <div className="mt-4 flex items-center justify-between border-t border-[color:var(--nodu-border)] pt-4">
            <span className="text-sm text-[color:var(--nodu-text-soft)]">Celkem</span>
            <span className="text-lg font-bold text-[color:var(--nodu-text)]">{formatPrice(cartTotalCents)}</span>
          </div>

          {message && (
            <div
              role={messageTone === 'success' ? 'status' : 'alert'}
              className={`mt-4 flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold ${messageTone === 'success' ? 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]' : 'border-red-200 bg-red-50 text-red-700'}`}
            >
              {messageTone === 'success' && <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
              <span>{message}</span>
            </div>
          )}

          <Button type="button" className="mt-4 w-full" onClick={handleSubmit} disabled={isSubmitting}>
            Vytvorit rezervaci
          </Button>
        </aside>
      </div>
    </div>
  );
};

export default WarehouseView;
