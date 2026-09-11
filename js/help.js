// =============================================================
// Help & Support: submit an enquiry, report a problem, or appeal
// a decision, and track every past request's status.
// =============================================================

import { supabase } from "./supabaseClient.js";
import { requireSession } from "./auth.js";

const STATUS_BADGE = { submitted: "badge-info", under_review: "badge-info", responded: "badge-warning", closed: "badge-neutral" };
const TYPE_LABEL = { enquiry: "Enquiry", problem: "Problem report", appeal: "Appeal" };

let session = null;

async function init() {
  session = await requireSession();
  if (!session) return;

  await populateApplicationOptions();
  await loadAndRenderRequests();

  document.querySelector("#help-form").addEventListener("submit", handleSubmit);
}

async function populateApplicationOptions() {
  const { data } = await supabase
    .from("applications")
    .select("id, reference_number, grant_types(name)")
    .eq("user_id", session.user.id)
    .order("application_date", { ascending: false });

  const select = document.querySelector("#related-application");
  (data || []).forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.reference_number} — ${a.grant_types?.name || "Grant"}`;
    select.appendChild(opt);
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const messageEl = document.querySelector("#form-message");
  const submitBtn = form.querySelector("button[type=submit]");

  const type = form.type.value;
  const relatedApplication = form.related_application.value || null;
  const reason = form.reason.value.trim();

  if (!reason) {
    showMessage(messageEl, "Please describe your enquiry, problem or appeal.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  const referenceNumber = `SUP-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

  const { error } = await supabase.from("support_requests").insert({
    user_id: session.user.id,
    application_id: relatedApplication,
    type,
    reason,
    reference_number: referenceNumber,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Submit request";

  if (error) {
    showMessage(messageEl, error.message, "error");
    return;
  }

  showMessage(messageEl, `Submitted — your reference number is ${referenceNumber}.`, "success");
  form.reset();
  loadAndRenderRequests();
}

async function loadAndRenderRequests() {
  const { data, error } = await supabase
    .from("support_requests")
    .select("*, applications(reference_number)")
    .eq("user_id", session.user.id)
    .order("submitted_at", { ascending: false });

  render(error ? [] : data, error);
}

function render(requests, error) {
  const el = document.querySelector("#requests-list");

  if (error) {
    el.innerHTML = `<p class="hint">Could not load your requests: ${error.message}</p>`;
    return;
  }
  if (!requests.length) {
    el.innerHTML = `<p class="hint">You haven't submitted any requests yet.</p>`;
    return;
  }

  el.innerHTML = requests
    .map(
      (r) => `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-title-row">
        <h4 class="mb-0">${TYPE_LABEL[r.type] || r.type}${r.applications ? ` — ${r.applications.reference_number}` : ""}</h4>
        <span class="badge ${STATUS_BADGE[r.status] || "badge-neutral"}">${r.status.replace(/_/g, " ")}</span>
      </div>
      <p class="mb-0" style="margin-top:6px;">${r.reason}</p>
      <p class="hint" style="margin-top:8px;">Reference ${r.reference_number} · Submitted ${new Date(r.submitted_at).toLocaleDateString()}</p>
    </div>`
    )
    .join("");
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.classList.remove("error", "success");
  el.classList.add("show", type);
}

init();
