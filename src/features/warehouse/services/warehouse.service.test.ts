import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalAppData, updateLocalAppState } from '../../../lib/app-data';
import {
  createWarehouseReservation,
  findWarehouseReservationConflicts,
  getWarehouseCatalogRows,
  getWarehouseDependencies,
} from './warehouse.service';

vi.mock('../../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

describe('warehouse service', () => {
  beforeEach(() => {
    updateLocalAppState(() => getLocalAppData());
  });

  it('returns imported Booqable items as catalog rows', () => {
    const rows = getWarehouseCatalogRows({
      startsAt: '2026-05-02T09:00',
      endsAt: '2026-05-02T18:00',
    });

    expect(rows).toHaveLength(10);
    expect(rows[0].item.name).toBe('mix pult Pioneer DJM 900');
    expect(rows[0].availableQuantity).toBe(1);
    expect(rows[0].isAvailable).toBe(true);
  });

  it('blocks a reservation quantity above available count', async () => {
    await expect(createWarehouseReservation({
      projectJobNumber: 'TEST001',
      projectId: 'TEST001',
      eventLocalId: 1,
      startsAt: '2026-05-02T09:00',
      endsAt: '2026-05-02T18:00',
      note: '',
      items: [{ warehouseItemId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
    })).rejects.toThrow('Pozadovane mnozstvi neni dostupne.');
  });

  it('blocks duplicate cart lines when their combined quantity exceeds availability', async () => {
    await expect(createWarehouseReservation({
      projectJobNumber: 'TEST001',
      projectId: 'TEST001',
      eventLocalId: 1,
      startsAt: '2026-05-02T09:00',
      endsAt: '2026-05-02T18:00',
      note: '',
      items: [
        { warehouseItemId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
        { warehouseItemId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
      ],
    })).rejects.toThrow('Pozadovane mnozstvi neni dostupne.');
  });

  it('snapshots item names and prices into reservation lines', async () => {
    const saved = await createWarehouseReservation({
      projectJobNumber: 'TEST001',
      projectId: 'TEST001',
      eventLocalId: 1,
      startsAt: '2026-05-03T09:00',
      endsAt: '2026-05-03T18:00',
      note: 'Test skladu',
      items: [{ warehouseItemId: '33333333-3333-4333-8333-333333333333', quantity: 1 }],
    });

    expect(saved.totalCents).toBe(5000);
    expect(saved.items[0]).toMatchObject({
      warehouseItemId: '33333333-3333-4333-8333-333333333333',
      itemNameSnapshot: 'Makita DML 805 (venkovni led svetlo)',
      unitPriceCents: 5000,
      lineTotalCents: 5000,
    });
  });

  it('finds conflicts for overlapping reservations', async () => {
    await createWarehouseReservation({
      projectJobNumber: 'AKV104',
      projectId: 'AKV104',
      eventLocalId: 22,
      startsAt: '2026-05-04T09:00',
      endsAt: '2026-05-04T18:00',
      note: '',
      items: [{ warehouseItemId: '55555555-5555-4555-8555-555555555555', quantity: 1 }],
    });

    const conflicts = findWarehouseReservationConflicts({
      projectJobNumber: 'BNZ003',
      projectId: 'BNZ003',
      eventLocalId: 26,
      startsAt: '2026-05-04T12:00',
      endsAt: '2026-05-04T20:00',
      note: '',
      items: [{ warehouseItemId: '55555555-5555-4555-8555-555555555555', quantity: 1 }],
    });

    expect(conflicts).toEqual([
      expect.objectContaining({
        warehouseItemId: '55555555-5555-4555-8555-555555555555',
        requestedQuantity: 1,
        availableQuantity: 0,
      }),
    ]);
  });

  it('exposes projects and events as dependencies for the view', () => {
    const dependencies = getWarehouseDependencies();

    expect(dependencies.projects.length).toBeGreaterThan(0);
    expect(dependencies.events.length).toBeGreaterThan(0);
  });
});
