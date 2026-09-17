// =============================================================
// Administrator review screen: view one application in full,
// verify documents, and act on it (request documents, approve
// with a simulated payment, or reject with a reason). Every
// decision is logged to audit_logs and notifies the beneficiary.
// =============================================================

import { supabase } from "../js/supabaseClient.js";
import { requireAdminSession } from "../js/auth.js";

const STATUS_BADGE = {
  submitted: "badge-info",
  under_review: "badge-info",
  further_assessment_required: "badge-warning",
  documents_required: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
};

let session = null;
let applicationId = null;
let application = null;

async function init() {
  session = await requireAdminSession();
  if (!session) return;

  applicationId = new URLSearchParams(window.location.search).get("id");
  if (!applicationId) return showNotFound("No application was specified.");

  const { data, error } = await fetchApplication();
  if (error || !data) {
    return showNotFound(error ? `We couldn't load that application: ${error.message}` : "We couldn't find that application.");
  }
  application = data;

  await maybeMarkUnderReview();
  render();
  wireActions();
}

async function fetchApplication() {
  const { data, error } = await supabase
    .from("applications")
    // profiles!user_id disambiguates which relationship to follow:
    // applications has two foreign keys into profiles (user_id and
    // reviewed_by), so without this hint Supabase can't tell which
    // one to use and the whole query fails.
    .select("*, grant_types(name), profiles!user_id(first_name,last_name,id_number,phone,email,address,date_of_birth), documents(*), payments(*)")
    .eq("id", applicationId)
    .single();
  return { data, error };
}

// The moment an administrator opens a freshly submitted (or
// further-assessment) application, it moves to "under review" —
// this is a silent status change, not something the beneficiary
// is notified about, matching the SRS workflow.
async function maybeMarkUnderReview() {
  if (["submitted", "further_assessment_required"].includes(application.status)) {
    await supabase.from("applications").update({ status: "under_review" }).eq("id", applicationId);
    application.status = "under_review";
  }
}

function showNotFound(message) {
  document.querySelector("#review-container").innerHTML =
    `<div class="card empty-state"><p>${message}</p><a href="dashboard.html" class="btn btn-outline btn-sm">Back to applications</a></div>`;
}

function render() {
  const a = application;
  const p = a.profiles || {};

  document.querySelector("#review-container").innerHTML = `
    <div class="card">
      <div class="card-title-row">
        <h1 class="mb-0">${a.grant_types?.name || "Grant application"}</h1>
        <span class="badge ${STATUS_BADGE[a.status] || "badge-neutral"}">${a.status.replace(/_/g, " ")}</span>
      </div>
      <div class="ticket-stub" style="margin-top:16px;">
        <div><div class="label">Reference number</div><div class="ref">${a.reference_number}</div></div>
        <div><div class="label">Submitted</div><div>${new Date(a.application_date).toLocaleDateString()}</div></div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:20px;">
      <div class="card">
        <h3>Applicant</h3>
        <ul class="review-list">
          <li><span class="k">Name</span><span class="v">${p.first_name || ""} ${p.last_name || ""}</span></li>
          <li><span class="k">ID number</span><span class="v">${p.id_number || "—"}</span></li>
          <li><span class="k">Date of birth</span><span class="v">${p.date_of_birth || "—"}</span></li>
          <li><span class="k">Phone</span><span class="v">${p.phone || "—"}</span></li>
          <li><span class="k">Email</span><span class="v">${p.email || "—"}</span></li>
          <li><span class="k">Address</span><span class="v">${p.address || "—"}</span></li>
        </ul>
      </div>
      <div class="card">
        <h3>Screening</h3>
        <ul class="review-list">
          <li><span class="k">Result</span><span class="v">${screeningLabel(a.screening_result)}</span></li>
          ${a.screening_reason ? `<li><span class="k">Reason</span><span class="v">${a.screening_reason}</span></li>` : ""}
        </ul>
        ${renderDetails(a.details)}
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <h3>Documents</h3>
      ${renderDocuments(a.documents)}
    </div>

    ${a.status === "rejected" ? "" : renderActionsCard(a)}

    ${a.status === "rejected" ? `
    <div class="card" style="margin-top:20px; border-color:var(--color-danger);">
      <h3>Rejected</h3>
      <p>${a.rejection_reason || "No reason recorded."}</p>
    </div>` : ""}

    ${a.status === "approved" ? renderPaymentCard(a.payments?.[0]) : ""}
  `;

  wireDocumentButtons();
}

function renderDetails(details) {
  const entries = Object.entries(details || {}).filter(([, v]) => v !== "" && v !== false);
  if (!entries.length) return "";
  return `<h4 style="margin-top:16px;">Additional information</h4>
    <ul class="review-list">
      ${entries.map(([k, v]) => `<li><span class="k">${k.replace(/_/g, " ")}</span><span class="v">${v === true ? "Yes" : v}</span></li>`).join("")}
    </ul>`;
}

function renderDocuments(documents) {
  if (!documents || !documents.length) return `<p class="hint">No documents uploaded.</p>`;
  return `<div class="doc-checklist">
    ${documents
      .map(
        (d) => `
      <div class="doc-item">
        <div class="doc-item-head">
          <strong>${d.document_type.replace(/_/g, " ")}</strong>
          <span class="badge ${d.verification_status === "verified" ? "badge-success" : "badge-neutral"}">${d.verification_status}</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" data-view-doc="${d.file_url}">View file</button>
          ${d.verification_status !== "verified" ? `<button class="btn btn-outline btn-sm" data-verify-doc="${d.id}">Mark verified</button>` : ""}
        </div>
      </div>`
      )
      .join("")}
  </div>`;
}

function renderActionsCard() {
  return `
  <div class="card" style="margin-top:20px;">
    <h3>Decision</h3>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-outline" data-open-panel="documents">Request additional documents</button>
      <button class="btn btn-primary" data-open-panel="approve">Approve</button>
      <button class="btn btn-outline" style="color:var(--color-danger); border-color:var(--color-danger);" data-open-panel="reject">Reject</button>
    </div>

    <div class="action-panel" id="panel-documents">
      <div class="field"><label>What's needed from the applicant?</label>
        <textarea id="documents-message" rows="3" placeholder="e.g. Please upload a recent bank statement."></textarea>
      </div>
      <div id="documents-error" class="form-message" role="alert"></div>
      <button class="btn btn-primary btn-sm" id="submit-documents">Send request</button>
    </div>

    <div class="action-panel" id="panel-approve">
      <div class="field"><label>Grant amount (R)</label>
        <input type="text" id="approve-amount" inputmode="decimal" placeholder="e.g. 2090.00" />
      </div>
      <div id="approve-error" class="form-message" role="alert"></div>
      <button class="btn btn-primary btn-sm" id="submit-approve">Confirm approval</button>
    </div>

    <div class="action-panel" id="panel-reject">
      <div class="field"><label>Reason for rejection</label>
        <textarea id="reject-reason" rows="3" placeholder="Explain why this application was not approved."></textarea>
      </div>
      <div id="reject-error" class="form-message" role="alert"></div>
      <button class="btn btn-primary btn-sm" id="submit-reject">Confirm rejection</button>
    </div>
  </div>`;
}

function renderPaymentCard(payment) {
  if (!payment) return "";
  const badge = { scheduled: "badge-info", processing: "badge-warning", completed: "badge-success" }[payment.status] || "badge-neutral";
  const nextLabel = { scheduled: "Mark as Processing", processing: "Mark as Completed" }[payment.status];
  return `
  <div class="card" style="margin-top:20px;">
    <h3>Payment</h3>
    <ul class="review-list">
      <li><span class="k">Amount</span><span class="v">R${payment.amount}</span></li>
      <li><span class="k">Status</span><span class="v"><span class="badge ${badge}">${payment.status}</span></span></li>
      <li><span class="k">Reference</span><span class="v">${payment.reference_number}</span></li>
    </ul>
    ${nextLabel ? `<button class="btn btn-outline btn-sm" id="advance-payment" data-payment-id="${payment.id}" data-current-status="${payment.status}">${nextLabel}</button>` : `<p class="hint">Payment completed.</p>`}
    <div id="payment-error" class="form-message" role="alert"></div>
  </div>`;
}

function screeningLabel(result) {
  return { potentially_eligible: "Potentially eligible", potentially_ineligible: "Potentially ineligible", further_assessment_required: "Further assessment required" }[result] || result || "—";
}

// ---------- wiring ----------
function wireActions() {
  document.querySelectorAll("[data-open-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.openPanel;
      document.querySelectorAll(".action-panel").forEach((p) => p.classList.remove("open"));
      document.querySelector(`#panel-${name}`)?.classList.add("open");
    });
  });

  document.querySelector("#submit-documents")?.addEventListener("click", handleRequestDocuments);
  document.querySelector("#submit-approve")?.addEventListener("click", handleApprove);
  document.querySelector("#submit-reject")?.addEventListener("click", handleReject);
  document.querySelector("#advance-payment")?.addEventListener("click", handleAdvancePayment);
}

function wireDocumentButtons() {
  document.querySelectorAll("[data-view-doc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const path = btn.dataset.viewDoc;
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 600);
      if (error) return alert(`Could not open file: ${error.message}`);
      window.open(data.signedUrl, "_blank");
    });
  });
  document.querySelectorAll("[data-verify-doc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const docId = btn.dataset.verifyDoc;
      const { error } = await supabase.from("documents").update({ verification_status: "verified" }).eq("id", docId);
      if (error) return alert(`Could not mark this document as verified: ${error.message}`);
      application = (await fetchApplication()).data;
      render();
      wireActions();
    });
  });
}

async function handleRequestDocuments() {
  const message = document.querySelector("#documents-message").value.trim();
  if (!message) return setError("documents-error", "Please describe what's needed.");

  const { error: updateError } = await supabase.from("applications").update({
    status: "documents_required",
    reviewed_at: new Date().toISOString(),
    reviewed_by: session.user.id,
  }).eq("id", applicationId);
  if (updateError) return setError("documents-error", `Could not update the application: ${updateError.message}`);

  await supabase.from("notifications").insert({
    user_id: application.user_id,
    title: "Additional documentation required",
    message,
  });

  await logAudit("request_documents", `Requested additional documents for ${application.reference_number}: ${message}`);

  application = (await fetchApplication()).data;
  render();
  wireActions();
}

async function handleApprove() {
  const raw = document.querySelector("#approve-amount").value.trim();
  const amount = Number(raw);
  if (!raw || Number.isNaN(amount) || amount <= 0) {
    return setError("approve-error", "Please enter a valid grant amount.");
  }

  const { error: updateError } = await supabase.from("applications").update({
    status: "approved",
    reviewed_at: new Date().toISOString(),
    reviewed_by: session.user.id,
  }).eq("id", applicationId);
  if (updateError) return setError("approve-error", `Could not approve the application: ${updateError.message}`);

  const paymentReference = `SIM-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const { error: paymentError } = await supabase.from("payments").insert({
    application_id: applicationId,
    beneficiary_id: application.user_id,
    amount,
    status: "scheduled",
    payment_method: "simulated",
    reference_number: paymentReference,
  });
  if (paymentError) return setError("approve-error", `Application approved, but the payment could not be scheduled: ${paymentError.message}`);

  await supabase.from("notifications").insert({
    user_id: application.user_id,
    title: "Application approved",
    message: `Your application ${application.reference_number} has been approved. A payment of R${amount} has been scheduled.`,
  });

  await logAudit("approve_application", `Approved ${application.reference_number}, scheduled payment of R${amount}`);

  application = (await fetchApplication()).data;
  render();
  wireActions();
}

async function handleReject() {
  const reason = document.querySelector("#reject-reason").value.trim();
  if (!reason) return setError("reject-error", "Please explain the reason for rejection.");

  const { error: updateError } = await supabase.from("applications").update({
    status: "rejected",
    rejection_reason: reason,
    reviewed_at: new Date().toISOString(),
    reviewed_by: session.user.id,
  }).eq("id", applicationId);
  if (updateError) return setError("reject-error", `Could not reject the application: ${updateError.message}`);

  await supabase.from("notifications").insert({
    user_id: application.user_id,
    title: "Application not approved",
    message: `Your application ${application.reference_number} was not approved. Reason: ${reason}`,
  });

  await logAudit("reject_application", `Rejected ${application.reference_number}: ${reason}`);

  application = (await fetchApplication()).data;
  render();
  wireActions();
}

async function handleAdvancePayment(e) {
  const paymentId = e.target.dataset.paymentId;
  const current = e.target.dataset.currentStatus;
  const next = { scheduled: "processing", processing: "completed" }[current];
  if (!next) return;

  const { error: updateError } = await supabase.from("payments").update({ status: next, payment_date: new Date().toISOString() }).eq("id", paymentId);
  if (updateError) return setError("payment-error", `Could not update the payment: ${updateError.message}`);

  await supabase.from("notifications").insert({
    user_id: application.user_id,
    title: "Payment update",
    message: `Your payment for application ${application.reference_number} is now ${next}.`,
  });

  await logAudit("advance_payment", `Payment for ${application.reference_number} moved to ${next}`);

  application = (await fetchApplication()).data;
  render();
  wireActions();
}

async function logAudit(action, description) {
  await supabase.from("audit_logs").insert({ user_id: session.user.id, action, description });
}

function setError(id, message) {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show", "error");
}

init();
