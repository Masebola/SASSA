// =============================================================
// Application status page: loads one application (by ?id=) that
// belongs to the signed-in user, and renders a progress timeline,
// the document checklist, and any payment already scheduled.
// =============================================================

import { supabase } from "./supabaseClient.js";
import { requireSession } from "./auth.js";

const STATUS_BADGE = {
  submitted: "badge-info",
  screening: "badge-info",
  further_assessment_required: "badge-warning",
  documents_required: "badge-warning",
  under_review: "badge-info",
  approved: "badge-success",
  rejected: "badge-danger",
};

const STATUS_LABEL = {
  submitted: "Submitted",
  screening: "Screening",
  further_assessment_required: "Further assessment required",
  documents_required: "Documents required",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
};

async function init() {
  const session = await requireSession();
  if (!session) return;

  const id = new URLSearchParams(window.location.search).get("id");
  const container = document.querySelector("#status-container");
  if (!id) {
    container.innerHTML = `<div class="card empty-state"><p>No application was specified.</p><a href="dashboard.html" class="btn btn-outline btn-sm">Back to dashboard</a></div>`;
    return;
  }

  const { data: application, error } = await supabase
    .from("applications")
    .select("*, grant_types(name), documents(*), payments(*)")
    .eq("id", id)
    .single();

  if (error || !application) {
    container.innerHTML = `<div class="card empty-state"><p>We couldn't find that application.</p><a href="dashboard.html" class="btn btn-outline btn-sm">Back to dashboard</a></div>`;
    return;
  }

  render(application);
}

function render(application) {
  document.querySelector("#status-container").innerHTML = `
    <div class="card">
      <div class="card-title-row">
        <h1 class="mb-0">${application.grant_types?.name || "Grant application"}</h1>
        <span class="badge ${STATUS_BADGE[application.status] || "badge-neutral"}">${STATUS_LABEL[application.status] || application.status}</span>
      </div>
      <div class="ticket-stub" style="margin-top:16px;">
        <div>
          <div class="label">Reference number</div>
          <div class="ref">${application.reference_number}</div>
        </div>
        <div>
          <div class="label">Submitted</div>
          <div>${new Date(application.application_date).toLocaleDateString()}</div>
        </div>
      </div>
    </div>

    ${application.status === "rejected" && application.rejection_reason ? `
    <div class="card" style="margin-top:20px; border-color:var(--color-danger);">
      <h3>Reason for this decision</h3>
      <p>${application.rejection_reason}</p>
      <p class="hint">If you'd like to appeal this decision, you can do so from the <a href="help.html">Help</a> page.</p>
    </div>` : ""}

    <div class="card" style="margin-top:20px;">
      <h3>Progress</h3>
      ${renderTimeline(application.status)}
    </div>

    <div class="card" style="margin-top:20px;">
      <h3>Documents</h3>
      ${renderDocuments(application.documents)}
    </div>

    ${application.payments && application.payments.length ? `
    <div class="card" style="margin-top:20px;">
      <h3>Payment</h3>
      ${renderPayment(application.payments[0])}
    </div>` : ""}
  `;
}

function renderTimeline(status) {
  const stages = [
    { key: "submitted", label: "Application submitted", desc: "Your application has been received." },
    { key: "review", label: "Under review", desc: "An administrator is reviewing your application." },
    { key: "decision", label: "Decision", desc: "Approved, or rejected with a reason." },
    { key: "payment", label: "Payment", desc: "Simulated payment is scheduled once approved." },
  ];

  let currentIndex = 1; // default: under review
  if (["approved", "rejected"].includes(status)) currentIndex = 2;

  return `<ul class="timeline">
    ${stages
      .map((s, i) => {
        const cls = i < currentIndex ? "done" : i === currentIndex ? "current" : "pending";
        const mark = i < currentIndex ? "✓" : i + 1;
        return `<li class="${cls}">
          <div class="dot">${mark}</div>
          <div class="content"><h4>${s.label}</h4><p>${s.desc}</p></div>
        </li>`;
      })
      .join("")}
  </ul>`;
}

function renderDocuments(documents) {
  if (!documents || !documents.length) {
    return `<p class="hint">No documents on file for this application.</p>`;
  }
  return `<ul class="review-list">
    ${documents
      .map(
        (d) => `<li>
        <span class="k">${d.document_type.replace(/_/g, " ")}</span>
        <span class="v"><span class="badge ${d.verification_status === "verified" ? "badge-success" : "badge-neutral"}">${d.verification_status}</span></span>
      </li>`
      )
      .join("")}
  </ul>`;
}

function renderPayment(payment) {
  const badge = { scheduled: "badge-info", processing: "badge-warning", completed: "badge-success" }[payment.status] || "badge-neutral";
  return `<ul class="review-list">
    <li><span class="k">Amount</span><span class="v">R${payment.amount}</span></li>
    <li><span class="k">Status</span><span class="v"><span class="badge ${badge}">${payment.status}</span></span></li>
    <li><span class="k">Reference</span><span class="v">${payment.reference_number}</span></li>
  </ul>`;
}

init();
