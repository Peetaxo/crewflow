export const queryKeys = {
  events: {
    all: ['events'] as const,
    list: (search = '') => ['events', 'list', search] as const,
  },
  timelogs: {
    all: ['timelogs'] as const,
    list: (search = '') => ['timelogs', 'list', search] as const,
  },
  receipts: {
    all: ['receipts'] as const,
    list: (search = '') => ['receipts', 'list', search] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (search = '') => ['invoices', 'list', search] as const,
  },
};
