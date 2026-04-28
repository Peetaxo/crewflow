import type {
  Client,
  Contractor,
  Event,
  InvoiceCustomerSnapshot,
  InvoiceSupplierSnapshot,
  Project,
  ReceiptItem,
  Timelog,
} from '../../../types';

const requireText = (value: string | null | undefined): string => (value ?? '').trim();

const findClientForEvent = (
  eventId: number,
  events: Event[],
  projects: Project[],
  clients: Client[],
): Client => {
  const event = events.find((item) => item.id === eventId);
  if (!event?.projectId) {
    throw new Error('Akce nema prirazeny projekt.');
  }

  const project = projects.find((item) => item.supabaseId === event.projectId);
  if (!project?.clientId) {
    throw new Error('Projekt nema prirazeneho odberatele.');
  }

  const client = clients.find((item) => item.supabaseId === project.clientId);
  if (!client) {
    throw new Error('Odberatel projektu nebyl nalezen.');
  }

  return client;
};

export const resolveSingleInvoiceClient = ({
  timelogs,
  receipts,
  selectedTimelogIds,
  selectedReceiptIds,
  events,
  projects,
  clients,
}: {
  timelogs: Timelog[];
  receipts: ReceiptItem[];
  selectedTimelogIds: number[];
  selectedReceiptIds: number[];
  events: Event[];
  projects: Project[];
  clients: Client[];
}): Client => {
  const selectedTimelogs = timelogs.filter((item) => selectedTimelogIds.includes(item.id));
  const selectedReceipts = receipts.filter((item) => selectedReceiptIds.includes(item.id));
  const clientById = new Map<string, Client>();

  selectedTimelogs.forEach((timelog) => {
    const client = findClientForEvent(timelog.eid, events, projects, clients);
    clientById.set(client.supabaseId ?? String(client.id), client);
  });

  selectedReceipts.forEach((receipt) => {
    const client = findClientForEvent(receipt.eid, events, projects, clients);
    clientById.set(client.supabaseId ?? String(client.id), client);
  });

  if (clientById.size === 0) {
    throw new Error('Faktura nema zadne polozky s odberatelem.');
  }

  if (clientById.size > 1) {
    throw new Error('Faktura muze obsahovat polozky pouze pro jednoho odberatele.');
  }

  return Array.from(clientById.values())[0];
};

export const buildSupplierSnapshot = (contractor: Contractor): InvoiceSupplierSnapshot => ({
  profileId: contractor.profileId ?? '',
  name: requireText(contractor.billingName) || contractor.name,
  ico: requireText(contractor.ico),
  dic: requireText(contractor.dic) || null,
  bankAccount: requireText(contractor.bank),
  iban: requireText(contractor.iban) || null,
  billingStreet: requireText(contractor.billingStreet),
  billingZip: requireText(contractor.billingZip),
  billingCity: requireText(contractor.billingCity) || requireText(contractor.city),
  billingCountry: requireText(contractor.billingCountry) || 'Ceska republika',
  vatPayer: false,
});

export const buildCustomerSnapshot = (client: Client): InvoiceCustomerSnapshot => ({
  clientId: client.supabaseId ?? String(client.id),
  name: requireText(client.name),
  ico: requireText(client.ico),
  dic: requireText(client.dic) || null,
  street: requireText(client.street),
  zip: requireText(client.zip),
  city: requireText(client.city),
  country: requireText(client.country) || 'Ceska republika',
});

export const validateInvoiceSnapshots = (
  supplier: InvoiceSupplierSnapshot,
  customer: InvoiceCustomerSnapshot,
): string[] => {
  const errors: string[] = [];

  if (!supplier.name) errors.push('Dodavateli chybi jmeno nebo firma.');
  if (!supplier.ico) errors.push('Dodavateli chybi ICO.');
  if (!supplier.billingStreet || !supplier.billingZip || !supplier.billingCity) {
    errors.push('Dodavateli chybi fakturacni adresa.');
  }
  if (!supplier.bankAccount) errors.push('Dodavateli chybi bankovni ucet.');
  if (!customer.name) errors.push('Odberateli chybi nazev.');
  if (!customer.ico) errors.push('Odberateli chybi ICO.');
  if (!customer.street || !customer.zip || !customer.city) {
    errors.push('Odberateli chybi adresa.');
  }

  return errors;
};
