import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMockState = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  rowsByTable: {
    warehouse_items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'mix pult Pioneer DJM 900',
        category: 'Zvuk',
        description: null,
        image_url: 'https://example.com/mix.jpg',
        price_cents: 200000,
        currency: 'CZK',
        price_period_label: '1 Den',
        quantity_total: 1,
        owner_client_id: null,
        owner_label: null,
        status: 'active',
        booqable_product_id: 'booqable-mix',
        booqable_product_path: '/products/mix-pult-pioneer-djm-900',
      },
    ],
    warehouse_reservations: [],
    warehouse_reservation_items: [],
  },
}));

vi.mock('../../../lib/app-config', () => ({
  appDataSource: 'supabase',
  isLocalDataEnabled: false,
}));

vi.mock('../../../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return supabaseMockState.isSupabaseConfigured;
  },
  supabase: {
    from: (table: keyof typeof supabaseMockState.rowsByTable) => ({
      select: () => ({
        order: async () => ({
          data: supabaseMockState.rowsByTable[table],
          error: null,
        }),
      }),
    }),
  },
}));

describe('warehouse Supabase hydration', () => {
  beforeEach(async () => {
    vi.resetModules();
    const appData = await import('../../../lib/app-data');
    const warehouseService = await import('./warehouse.service');
    warehouseService.resetSupabaseWarehouseHydration();
    appData.updateLocalAppState(() => appData.getLocalAppData());
  });

  it('hydrates warehouse catalog rows from Supabase in supabase mode', async () => {
    const { getWarehouseCatalogRows } = await import('./warehouse.service');

    expect(getWarehouseCatalogRows()).toHaveLength(0);

    await vi.waitFor(() => {
      const rows = getWarehouseCatalogRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].item.name).toBe('mix pult Pioneer DJM 900');
    });
  });
});
