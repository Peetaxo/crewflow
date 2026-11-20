import assert from "node:assert/strict";
import { test } from "node:test";
import { handleShiftInvoiceUpload } from "./handler.ts";
import type { Registration, ShiftInvoiceUploadStore } from "./handler.ts";

const owner = "aaaaaaaa-1111-4111-8111-111111111111";
const requestId = "bbbbbbbb-2222-4222-8222-222222222222";
const customerId = "cccccccc-3333-4333-8333-333333333333";
const timelog1 = "dddddddd-4444-4444-8444-444444444444";
const timelog2 = "eeeeeeee-5555-4555-8555-555555555555";
const attachmentId = "ffffffff-6666-4666-8666-666666666666";
const expectedStoragePath = `billing-statements/${requestId}/documents/${requestId}.pdf`;
const defaultFile = new File(["%PDF-1.7\ninvoice"], "invoice.pdf", {
  type: "application/pdf",
});

const makeRequest = (
  fields: Record<string, string | File> = {},
  token: string | null = "Bearer crew-session",
) => {
  const form = new FormData();
  for (
    const [name, value] of Object.entries({
      requestId,
      timelogIds: JSON.stringify([timelog1, timelog2]),
      customerId,
      invoiceNumber: " ORIGINAL 01 ",
      issueDate: "2026-11-20",
      dueDate: "2026-12-04",
      totalAmount: "6500.50",
      file: defaultFile,
      ...fields,
    })
  ) form.set(name, value);
  return new Request("http://local/upload-shift-invoice", {
    method: "POST",
    headers: token ? { Authorization: token } : {},
    body: form,
  });
};

const setup = () => {
  const events: string[] = [];
  let object: { bytes: Uint8Array; fingerprint: string } | null = null;
  let saved: Registration | null = null;
  let eligible = true;
  let loseUploadResponse = false;
  let loseRegistrationResponse = false;
  const store: ShiftInvoiceUploadStore = {
    async findUpload(userId, id) {
      assert.equal(userId, owner);
      assert.equal(id, requestId);
      events.push("find");
      return saved ? { attachment_id: attachmentId } : null;
    },
    async preflight(timelogIds) {
      assert.deepEqual(timelogIds, [timelog1, timelog2]);
      events.push("preflight");
      return {
        eligible,
        customer_id: customerId,
        customer_name: "Customer",
        attachment: null,
      };
    },
    async upload(path, bytes, fingerprint) {
      assert.equal(path, expectedStoragePath);
      events.push("upload");
      if (object) return false;
      object = { bytes: bytes.slice(), fingerprint };
      return !loseUploadResponse;
    },
    async readObject(path) {
      assert.equal(path, expectedStoragePath);
      events.push("read");
      return object;
    },
    async register(payload) {
      events.push("register");
      if (saved) assert.deepEqual(payload, saved);
      saved = payload;
      if (loseRegistrationResponse) throw new Error("Response lost");
      return { attachment_id: attachmentId };
    },
  };
  const send = (request: Request) =>
    handleShiftInvoiceUpload(request, async (authorization, token) => {
      events.push("authorize");
      assert.equal(authorization, "Bearer crew-session");
      assert.equal(token, "crew-session");
      return { userId: owner, store };
    });
  return {
    send,
    events,
    get saved() {
      return saved;
    },
    makeIneligible: () => {
      eligible = false;
    },
    loseUpload: () => {
      loseUploadResponse = true;
    },
    loseRegistration: (lose: boolean) => {
      loseRegistrationResponse = lose;
    },
  };
};

test("requires a bearer before admitting multipart data", async () => {
  const fixture = setup();
  const response = await fixture.send(makeRequest({}, null));
  assert.equal(response.status, 401);
  assert.deepEqual(fixture.events, []);
});

test("rejects invalid PDF MIME type, header, and size before the upload lookup", async () => {
  for (
    const [file, status, error] of [
      [
        new File(["%PDF-1.7\nbody"], "invoice.png", { type: "image/png" }),
        400,
        "invoice_billing_pdf_type_invalid",
      ],
      [
        new File(["bad signature"], "invoice.pdf", { type: "application/pdf" }),
        400,
        "invoice_billing_pdf_header_invalid",
      ],
      [
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "invoice.pdf", {
          type: "application/pdf",
        }),
        413,
        "invoice_billing_pdf_size_invalid",
      ],
    ] as const
  ) {
    const fixture = setup();
    const response = await fixture.send(makeRequest({ file }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
    assert.deepEqual(fixture.events, ["authorize"]);
  }
});

test("rejects invalid invoice metadata and duplicate timelogs before any store call", async () => {
  for (
    const [fields, error] of [
      [{ totalAmount: "1.001" }, "invoice_billing_document_metadata_invalid"],
      [
        { totalAmount: "10000000000.00" },
        "invoice_billing_document_metadata_invalid",
      ],
      [{ totalAmount: "-1.00" }, "invoice_billing_document_metadata_invalid"],
      [{ issueDate: "2026-02-30" }, "invoice_billing_document_metadata_invalid"],
      [{ dueDate: "2026-11-19" }, "invoice_billing_document_metadata_invalid"],
      [
        { invoiceNumber: "a".repeat(121) },
        "invoice_billing_document_metadata_invalid",
      ],
      [{ invoiceNumber: "a\0b" }, "invoice_billing_document_metadata_invalid"],
      [
        { timelogIds: JSON.stringify([timelog1, timelog1.toUpperCase()]) },
        "invoice_billing_id_invalid",
      ],
    ] as const
  ) {
    const fixture = setup();
    const response = await fixture.send(makeRequest(fields));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error });
    assert.deepEqual(fixture.events, ["authorize"]);
  }
});

test("checks the authenticated customer's eligibility before storing a new attachment", async () => {
  const fixture = setup();
  const response = await fixture.send(makeRequest({ customerId: owner }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "shift_invoice_attachment_not_eligible",
  });
  assert.equal(fixture.events.includes("upload"), false);
  assert.equal(fixture.events.includes("register"), false);
});

test("registers a valid invoice with verified owner, deterministic path, and normalized data", async () => {
  const fixture = setup();
  const response = await fixture.send(makeRequest({
    requestId: requestId.toUpperCase(),
    customerId: customerId.toUpperCase(),
    timelogIds: JSON.stringify([timelog2, timelog1.toUpperCase()]),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { attachment_id: attachmentId });
  assert.deepEqual(fixture.events, [
    "authorize",
    "find",
    "preflight",
    "upload",
    "register",
  ]);
  assert.deepEqual(fixture.saved, {
    p_user_id: owner,
    p_timelog_ids: [timelog1, timelog2],
    p_customer_id: customerId,
    p_request_id: requestId,
    p_storage_path: expectedStoragePath,
    p_sha256: "427a0de2d03fe9f85aa154d1244dff148d3ef80fa0803de94b58c891d6d86aa9",
    p_byte_size: defaultFile.size,
    p_invoice_number: "ORIGINAL 01",
    p_issue_date: "2026-11-20",
    p_due_date: "2026-12-04",
    p_total_amount: 6500.5,
  });
});

test("recovers when storage writes the PDF but loses its response", async () => {
  const fixture = setup();
  fixture.loseUpload();
  const response = await fixture.send(makeRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { attachment_id: attachmentId });
  assert.deepEqual(fixture.events, [
    "authorize",
    "find",
    "preflight",
    "upload",
    "read",
    "register",
  ]);
});

test("recovers an exact registered request after a lost response and later ineligible hours", async () => {
  const fixture = setup();
  fixture.loseRegistration(true);
  const firstResponse = await fixture.send(makeRequest());
  assert.equal(firstResponse.status, 503);
  assert.deepEqual(await firstResponse.json(), {
    error: "invoice_billing_upload_retry_required",
  });
  fixture.loseRegistration(false);
  fixture.makeIneligible();
  fixture.events.length = 0;
  const response = await fixture.send(makeRequest({
    timelogIds: JSON.stringify([timelog2, timelog1]),
    totalAmount: "6500.5",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { attachment_id: attachmentId });
  assert.deepEqual(fixture.events, ["authorize", "find", "read", "register"]);
});

test("rejects reusing a saved request with changed invoice metadata or bytes", async () => {
  const fixture = setup();
  assert.equal((await fixture.send(makeRequest())).status, 200);
  const changes: Record<string, string | File>[] = [
    { invoiceNumber: "a different number" },
    {
      file: new File(["%PDF-1.7\nreplacement"], "invoice.pdf", {
        type: "application/pdf",
      }),
    },
  ];
  for (const fields of changes) {
    fixture.events.length = 0;
    const response = await fixture.send(makeRequest(fields));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "invoice_billing_request_reuse",
    });
    assert.deepEqual(fixture.events, ["authorize", "find", "read"]);
  }
});
