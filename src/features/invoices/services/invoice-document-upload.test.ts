import { describe, expect, it } from "vitest";
import {
  assertSameUpload,
  assertUploadAllowed,
  validateInvoiceDocument,
} from "../../../../supabase/functions/upload-invoice-document/request";
import { assertManualPdfAllowed } from "../../../../supabase/functions/generate-invoice-pdf/request";
const bytes = new TextEncoder().encode("%PDF-1.7\nfixture");
const input = {
  requestId: "11111111-1111-4111-8111-111111111111",
  statementId: "22222222-2222-4222-8222-222222222222",
  expectedUpdatedAt: "2026-10-13T10:00:00.123456+00:00",
  invoiceNumber: " ORIGINAL 01 ",
  issueDate: "2026-10-13",
  dueDate: "2026-10-27",
  contentType: "application/pdf",
  bytes,
};
describe("private original PDF validation", () => {
  it("accepts a validated PDF and trims its original number", () =>
    expect(validateInvoiceDocument(input)).toMatchObject({
      ok: true,
      value: { invoiceNumber: "ORIGINAL 01" },
    }));
  it("rejects unsupported content types", () =>
    expect(validateInvoiceDocument({ ...input, contentType: "image/png" }).ok)
      .toBe(false));
  it("checks actual bytes exceeding 5 MiB", () =>
    expect(
      validateInvoiceDocument({
        ...input,
        bytes: new Uint8Array(5 * 1024 * 1024 + 1),
      }).ok,
    ).toBe(false));
  it("rejects a non-PDF header despite PDF type", () =>
    expect(
      validateInvoiceDocument({
        ...input,
        bytes: new TextEncoder().encode("not a pdf"),
      }).ok,
    ).toBe(false));
  it.each([{ issueDate: "2026-02-30" }, { issueDate: "0000-01-01" }, {
    dueDate: "2026-10-12",
  }, {
    invoiceNumber: " ",
  }, { expectedUpdatedAt: "tomorrow" }])(
    "rejects invalid original metadata %j",
    (patch) =>
      expect(validateInvoiceDocument({ ...input, ...patch }).ok).toBe(false),
  );
  it("rejects a foreign owner before file writes", () =>
    expect(() =>
      assertUploadAllowed(
        {
          contractor_user_id: "other",
          updated_at: input.expectedUpdatedAt,
          status: "ready",
        },
        "owner",
        true,
        input.expectedUpdatedAt,
      )
    ).toThrow("unauthorized"));
  it("rejects a mismatched raw statement version", () =>
    expect(() =>
      assertUploadAllowed(
        {
          contractor_user_id: "owner",
          updated_at: input.expectedUpdatedAt,
          status: "ready",
        },
        "owner",
        true,
        "2026-10-13T10:00:00.123455+00:00",
      )
    ).toThrow("conflict"));
  it("compares immutable upload metadata on a retry", () => {
    expect(() =>
      assertSameUpload({ sha256: "same", number: "01" }, {
        sha256: "same",
        number: "01",
      })
    ).not.toThrow();
    expect(() =>
      assertSameUpload({ sha256: "same", number: "01" }, {
        sha256: "changed",
        number: "01",
      })
    ).toThrow("request_reuse");
  });
});
describe("manual PDF source guard", () => {
  it("rejects uploaded originals", () =>
    expect(() => assertManualPdfAllowed({ billing_kind: "uploaded" })).toThrow(
      "uploaded",
    ));
  it("rejects every statement-backed generation before writes", () =>
    expect(() =>
      assertManualPdfAllowed({
        billing_kind: "self_billing",
        billing_statement_id: input.statementId,
      })
    ).toThrow("durable_job"));
  it("preserves legacy generation", () =>
    expect(() => assertManualPdfAllowed({ billing_statement_id: null })).not
      .toThrow());
});

import {
  saveInvoiceDocument,
  type UploadStore,
} from "../../../../supabase/functions/upload-invoice-document/upload";
const statement = {
  id: input.statementId,
  contractor_user_id: "owner",
  updated_at: input.expectedUpdatedAt,
  status: "ready",
  total_amount: 7030,
};
const makeStore = () => {
  let saved: Record<string, unknown> | null = null;
  let object: { bytes: Uint8Array; fingerprint: string } | null = null;
  let registrations = 0;
  let uploads = 0;
  const store: UploadStore = {
    loadOwnedStatement: async () => statement,
    findDocument: async () => saved,
    upload: async (_path, data, fingerprint) => {
      if (object) return false;
      object = { bytes: data, fingerprint };
      uploads++;
      return true;
    },
    readObject: async () => object,
    register: async (payload) => {
      registrations++;
      saved = {
        request_id: payload.p_request_id,
        statement_id: payload.p_statement_id,
        uploader_user_id: payload.p_uploader_user_id,
        statement_updated_at: payload.p_expected_updated_at,
        sha256: payload.p_sha256,
        byte_size: payload.p_byte_size,
        external_invoice_number: payload.p_invoice_number,
        issue_date: payload.p_issue_date,
        due_date: payload.p_due_date,
        total_amount: payload.p_total_amount,
      };
      return { document: saved, statement };
    },
  };
  return {
    store,
    get saved() {
      return saved;
    },
    get uploads() {
      return uploads;
    },
    get registrations() {
      return registrations;
    },
    orphan: () => {
      saved = null;
    },
    advance: () => {
      store.loadOwnedStatement = async () => ({
        ...statement,
        status: "issued",
        updated_at: "2026-10-14T10:00:00Z",
        total_amount: 8000,
      });
    },
  };
};
describe("saved upload retries and orphan recovery", () => {
  it("replays the original registration after statement acceptance and version advancement", async () => {
    const state = makeStore();
    const first = await saveInvoiceDocument(input, "owner", state.store);
    state.advance();
    const replay = await saveInvoiceDocument(input, "owner", state.store);
    expect(replay).toEqual(first);
    expect(state.uploads).toBe(1);
  });
  it("rejects changed bytes or metadata for a saved request", async () => {
    const { store } = makeStore();
    await saveInvoiceDocument(input, "owner", store);
    await expect(
      saveInvoiceDocument({ ...input, invoiceNumber: "other" }, "owner", store),
    ).rejects.toThrow("request_reuse");
    await expect(
      saveInvoiceDocument(
        { ...input, bytes: new TextEncoder().encode("%PDF-changed") },
        "owner",
        store,
      ),
    ).rejects.toThrow("request_reuse");
  });
  it("recovers an exact orphan without replacing its bytes", async () => {
    const state = makeStore();
    await saveInvoiceDocument(input, "owner", state.store);
    state.orphan();
    await saveInvoiceDocument(input, "owner", state.store);
    expect(state.uploads).toBe(1);
    expect(state.registrations).toBe(2);
  });
  it("rejects changed metadata for an orphan of the same request", async () => {
    const state = makeStore();
    await saveInvoiceDocument(input, "owner", state.store);
    state.orphan();
    await expect(
      saveInvoiceDocument(
        { ...input, dueDate: "2026-10-28" },
        "owner",
        state.store,
      ),
    ).rejects.toThrow("request_reuse");
    expect(state.registrations).toBe(1);
  });
});

import { readBoundedMultipart } from "../../../../supabase/functions/upload-invoice-document/request";
describe("bounded multipart request reading", () => {
  it("rejects streamed oversized bodies without trusting Content-Length", async () => {
    let chunks = 0;
    const body = new ReadableStream({
      pull(controller) {
        chunks++;
        if (chunks === 1) {
          controller.enqueue(
            new TextEncoder().encode(
              '--proof\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-',
            ),
          );
        } else if (chunks < 22) controller.enqueue(new Uint8Array(1024 * 1024));
        else {
          controller.enqueue(new TextEncoder().encode("\r\n--proof--\r\n"));
          controller.close();
        }
      },
    });
    const request = new Request(
      "http://localhost/upload",
      {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=proof" },
        body,
        duplex: "half",
      } as RequestInit,
    );
    await expect(readBoundedMultipart(request)).rejects.toMatchObject({
      status: 413,
    });
    expect(chunks).toBeLessThan(22);
  });
});
