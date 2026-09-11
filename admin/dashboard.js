// =============================================================
// Administrator dashboard: status summary cards + the application
// queue, with a client-side search/filter over a recent batch of
// applications (fine at student-project scale; a production system
// would push search/filter to the database instead).
// =============================================================

import { supabase } from "../js/supabaseClient.js";
import { requireAdminSession } from "../js/auth.js";

const STATUS_GROUPS = {
  pending_review: { label: "Pending Review", statuses: ["submitted", "under_review"], badge: "badge-info" },
  documents_required: { label: "Documents Required", statuses: ["documents_required"], badge: "badge-warning" },
  assessment: { label: "Assessment", statuses: ["further_assessment_required"], badge: "badge-warning" },
  approved: { label: "Approved", statuses: ["approved"], badge: "badge-success" },
  rejected: { label: "Rejected", statuses: ["rejected"], badge: "badge-danger" },
};

let allApplications = [];

async function init() {
  const session = await requireAdminSession();
  if (!session) return;

  await loadStats();
  await loadApplications();
  wireToolbar();
}

async function loadStats() {
  const el = document.querySelector("#stat-cards");
  const cards = await Promise.all(
    Object.entries(STATUS_GROUPS).map(async ([key, group]) => {
      const { count } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .in("status", group.statuses);
      return { key, label: group.label, count: count || 0 };
    })
  );
  el.innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="num">${c.count}</div><div class="label">${c.label}</div></div>`)
    .join("");
}

async function loadApplications() {
  const { data, error } = await supabase
    .from("applications")
    .select("id, reference_number, status, application_date, grant_types(name), profiles(first_name, last_name)")
    .order("application_date", { ascending: false })
    .limit(100);

  if (error) {
    document.querySelector("#applications-table-body").innerHTML =
      `<tr><td colspan="5">Could not load applications: ${error.message}</td></tr>`;
    return;
  }
  allApplications = data || [];
  renderTable(allApplications);
}

function renderTable(rows) {
  const body = document.querySelector("#applications-table-body");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5">No applications match your search.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (a) => `
    <tr>
      <td><span style="font-family:var(--font-mono);">${a.reference_number}</span></td>
      <td>${a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : "—"}</td>
      <td>${a.grant_types?.name || "—"}</td>
      <td><span class="badge ${badgeFor(a.status)}">${a.status.replace(/_/g, " ")}</span></td>
      <td><a href="application-review.html?id=${a.id}" class="btn btn-outline btn-sm">Review</a></td>
    </tr>`
    )
    .join("");
}

function badgeFor(status) {
  for (const group of Object.values(STATUS_GROUPS)) {
    if (group.statuses.includes(status)) return group.badge;
  }
  return "badge-neutral";
}

function wireToolbar() {
  const searchInput = document.querySelector("#search-input");
  const statusSelect = document.querySelector("#status-filter");

  function applyFilters() {
    const term = searchInput.value.trim().toLowerCase();
    const statusFilter = statusSelect.value;

    let rows = allApplications;
    if (statusFilter) {
      rows = rows.filter((a) => STATUS_GROUPS[statusFilter].statuses.includes(a.status));
    }
    if (term) {
      rows = rows.filter((a) => {
        const name = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}`.toLowerCase() : "";
        return a.reference_number.toLowerCase().includes(term) || name.includes(term) || (a.grant_types?.name || "").toLowerCase().includes(term);
      });
    }
    renderTable(rows);
  }

  searchInput.addEventListener("input", applyFilters);
  statusSelect.addEventListener("change", applyFilters);
}

init();
