// =============================================================
// Payment history: every simulated payment tied to the signed-in
// user's applications, most recent first.
// =============================================================

import { supabase } from "./supabaseClient.js";
import { requireSession } from "./auth.js";

const STATUS_BADGE = { scheduled: "badge-info", processing: "badge-warning", completed: "badge-success" };
const STATUS_STEP = { scheduled: 0, processing: 1, completed: 2 };
const STEPS = ["Scheduled", "Processing", "Completed"];

async function init() {
  const session = await requireSession();
  if (!session) return;

  const { data, error } = await supabase
    .from("payments")
    .select("*, applications(reference_number, grant_types(name))")
    .eq("beneficiary_id", session.user.id)
    .order("created_at", { ascending: false });

  render(error ? [] : data, error);
}

function render(payments, error) {
  const el = document.querySelector("#payments-list");

  if (error) {
    el.innerHTML = `<div class="card empty-state"><p>Could not load your payments: ${error.message}</p></div>`;
    return;
  }

  if (!payments.length) {
    el.innerHTML = `
      <div class="card empty-state">
        <div class="icon">💳</div>
        <p>No payments yet. A payment is scheduled automatically once an application is approved.</p>
        <a href="dashboard.html" class="btn btn-outline btn-sm">Back to dashboard</a>
      </div>`;
    return;
  }

  el.innerHTML = payments.map(renderPaymentCard).join("");
}

function renderPaymentCard(payment) {
  const currentStep = STATUS_STEP[payment.status] ?? 0;
  const grantName = payment.applications?.grant_types?.name || "Grant";
  const reference = payment.applications?.reference_number || "";

  return `
  <div class="card" style="margin-bottom:20px;">
    <div class="card-title-row">
      <h3 class="mb-0">${grantName}</h3>
      <span class="badge ${STATUS_BADGE[payment.status] || "badge-neutral"}">${payment.status}</span>
    </div>
    <p class="hint mb-0">Application ${reference}</p>

    <div class="ticket-stub" style="margin-top:16px;">
      <div><div class="label">Amount</div><div class="ref">R${payment.amount}</div></div>
      <div><div class="label">Payment reference</div><div class="ref">${payment.reference_number}</div></div>
    </div>

    <ol class="stepper" style="margin-top:18px;">
      ${STEPS.map((label, i) => `<li class="${i < currentStep ? "done" : i === currentStep ? "current" : ""}"><span class="num">${i < currentStep ? "✓" : i + 1}</span>${label}</li>`).join("")}
    </ol>
  </div>`;
}

init();
