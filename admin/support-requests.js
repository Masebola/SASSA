// =============================================================
// Administrator support requests: every enquiry, problem report,
// and appeal, with the ability to respond (which notifies the
// beneficiary) and move it through Submitted -> Under Review ->
// Responded -> Closed.
// =============================================================

import { supabase } from "../js/supabaseClient.js";
import { requireAdminSession } from "../js/auth.js";

const STATUS_BADGE = { submitted: "badge-info", under_review: "badge-info", responded: "badge-warning", closed: "badge-neutral" };
const TYPE_LABEL = { enquiry: "Enquiry", problem: "Problem report", appeal: "Appeal" };

let session = null;
let allRequests = [];

async function init() {
  session = await requireAdminSession();
  if (!session) return;

  await loadRequests();
  wireToolbar();
}

async function loadRequests() {
  const { data, error } = await supabase
    .from("support_requests")
    .select("*, profiles(first_name, last_name), applications(reference_number)")
    .order("submitted_at", { ascending: false });

  if (error) {
    document.querySelector("#requests-container").innerHTML = `<div class="card empty-state"><p>Could not load requests: ${error.message}</p></div>`;
    return;
  }
  allRequests = data || [];
  render(allRequests);
}

function render(rows) {
  const el = document.querySelector("#requests-container");
  if (!rows.length) {
    el.innerHTML = `<div class="card empty-state"><p>No requests match your search.</p></div>`;
    return;
  }

  el.innerHTML = rows
    .map(
      (r) => `
    <div class="card" style="margin-bottom:16px;" data-request-card="${r.id}">
      <div class="card-title-row">
        <h4 class="mb-0">${TYPE_LABEL[r.type] || r.type}${r.applications ? ` — ${r.applications.reference_number}` : ""}</h4>
        <span class="badge ${STATUS_BADGE[r.status] || "badge-neutral"}">${r.status.replace(/_/g, " ")}</span>
      </div>
      <p class="hint mb-0">${r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "—"} · Reference ${r.reference_number} · Submitted ${new Date(r.submitted_at).toLocaleDateString()}</p>
      <p style="margin-top:10px;">${r.reason}</p>

      ${r.status !== "closed" ? `
      <button class="btn btn-outline btn-sm" data-open-respond="${r.id}">Respond</button>
      <div class="action-panel" id="respond-panel-${r.id}">
        <div class="field"><label>Response to the beneficiary</label>
          <textarea data-response-text rows="3" placeholder="Explain the outcome or next steps."></textarea>
        </div>
        <div class="field"><label>New status</label>
          <select data-response-status>
            <option value="under_review">Under review</option>
            <option value="responded" selected>Responded</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div class="form-message" data-response-error role="alert"></div>
        <button class="btn btn-primary btn-sm" data-submit-response="${r.id}">Send response</button>
      </div>` : ""}
    </div>`
    )
    .join("");

  wireCardActions();
}

function wireCardActions() {
  document.querySelectorAll("[data-open-respond]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".action-panel").forEach((p) => p.classList.remove("open"));
      document.querySelector(`#respond-panel-${btn.dataset.openRespond}`)?.classList.add("open");
    });
  });

  document.querySelectorAll("[data-submit-response]").forEach((btn) => {
    btn.addEventListener("click", () => handleRespond(btn.dataset.submitResponse));
  });
}

async function handleRespond(requestId) {
  const card = document.querySelector(`[data-request-card="${requestId}"]`);
  const responseText = card.querySelector("[data-response-text]").value.trim();
  const newStatus = card.querySelector("[data-response-status]").value;
  const errorEl = card.querySelector("[data-response-error]");

  if (!responseText) {
    errorEl.textContent = "Please write a response before sending.";
    errorEl.classList.add("show", "error");
    return;
  }

  const request = allRequests.find((r) => r.id === requestId);

  await supabase.from("support_requests").update({ status: newStatus }).eq("id", requestId);

  await supabase.from("notifications").insert({
    user_id: request.user_id,
    title: "Update on your request",
    message: responseText,
  });

  await supabase.from("audit_logs").insert({
    user_id: session.user.id,
    action: "respond_support_request",
    description: `Responded to ${request.reference_number} (${request.type}), status now ${newStatus}: ${responseText}`,
  });

  await loadRequests();
}

function wireToolbar() {
  const searchInput = document.querySelector("#search-input");
  const statusSelect = document.querySelector("#status-filter");

  function applyFilters() {
    const term = searchInput.value.trim().toLowerCase();
    const status = statusSelect.value;
    let rows = allRequests;
    if (status) rows = rows.filter((r) => r.status === status);
    if (term) {
      rows = rows.filter((r) => {
        const name = r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}`.toLowerCase() : "";
        return name.includes(term) || r.reference_number.toLowerCase().includes(term) || r.reason.toLowerCase().includes(term);
      });
    }
    render(rows);
  }

  searchInput.addEventListener("input", applyFilters);
  statusSelect.addEventListener("change", applyFilters);
}

init();
