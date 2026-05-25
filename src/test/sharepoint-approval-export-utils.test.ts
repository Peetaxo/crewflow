import { describe, expect, it } from 'vitest';
import {
  buildSharePointApprovalImportSql,
  mapSharePointApprovalExport,
} from '../../scripts/sharepoint-approval-export-utils.mjs';

describe('SharePoint approval export utilities', () => {
  it('maps SharePoint document library metadata into approval documents', () => {
    const documents = mapSharePointApprovalExport({
      exportedAt: '2026-05-25T13:26:00Z',
      source: {
        siteUrl: 'https://hala19cz.sharepoint.com/sites/DocumentApproval',
        libraryTitle: 'Faktury',
        libraryId: 'library-id',
        libraryUrl: '/sites/DocumentApproval/ApprovalDocuments',
      },
      items: [
        {
          Id: 123,
          Modified: '2026-05-22T06:40:00Z',
          GUID: 'guid-123',
          FieldValuesAsText: {
            UniqueId: 'unique-123',
            FileLeafRef: 'Tyl - 2026-10.pdf',
            lggApprovalState: 've schvalování',
            lggInvoiceNumber: '',
            lggContractNumber: 'JTI001',
            lggVendorText: 'Milan Tyl',
            lggComment: 'Koncert Rene Dang\n\nMilan Tyl\n16. 5. 15:00-22:00\nCelkem 12h',
            lggCompany: 'NL',
            lggApprovers: 'Ales Burger;Marcela Siglova',
            Author: 'Petr Heitzer',
          },
        },
      ],
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      source: 'powerapps_document_approval',
      externalId: 'unique-123',
      documentName: 'Tyl - 2026-10.pdf',
      company: 'NL',
      jobNumber: 'JTI001',
      invoiceNumber: '2026-10',
      supplierName: 'Milan Tyl',
      approvalStatus: 'pending',
      approvalStatusLabel: 've schvalování',
      approvers: ['Ales Burger', 'Marcela Siglova'],
      requester: 'Petr Heitzer',
      lastSyncedAt: '2026-05-22T06:40:00Z',
    });
  });

  it('generates idempotent SQL without creating timelogs, invoices, or paid states', () => {
    const sql = buildSharePointApprovalImportSql([
      {
        source: 'powerapps_document_approval',
        externalId: 'unique-123',
        documentName: 'Tyl - 2026-10.pdf',
        company: 'NL',
        jobNumber: 'JTI001',
        invoiceNumber: '2026-10',
        supplierName: 'Milan Tyl',
        approvalStatus: 'pending',
        approvalStatusLabel: 've schvalování',
        comment: 'Koncert Rene Dang\nCelkem 12h',
        approvers: ['Ales Burger'],
        requester: 'Petr Heitzer',
        rawPayload: { item: { Id: 123 } },
        lastSyncedAt: '2026-05-22T06:40:00Z',
      },
    ]);

    expect(sql).toContain('insert into public.invoice_approval_documents');
    expect(sql).toContain('on conflict (source, external_id)');
    expect(sql).toContain('Tyl - 2026-10.pdf');
    expect(sql).not.toContain('insert into public.timelogs');
    expect(sql).not.toContain('insert into public.invoices');
    expect(sql).not.toContain("'paid'");
  });
});
