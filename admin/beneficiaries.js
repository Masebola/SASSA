// =============================================================
// Administrator beneficiaries list: every registered beneficiary,
// with a quick way to jump into their applications (reuses the
// applications queue's own search, via a ?search= URL param).
// =============================================================

import { supabase } from "../js/supabaseClient.js";
import { requireAdminSession } from "../js/auth.js";

let allBeneficiaries = [];

async function init() {
  const session = await requireAdminSession();
  if (!session) return;

  await loadBeneficiaries();
  wireToolbar();
}

async function loadBeneficiaries() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, id_number, phone, email, created_at")
    .eq("role", "beneficiary")
    .order("created_at", { ascending: false });

  if (error) {
    document.querySelector("#beneficiaries-table-body").innerHTML =
      `<tr><td colspan="5">Could not load beneficiaries: ${error.message}</td></tr>`;
    return;
  }

  // One extra query for application counts, grouped client-side —
  // simple and fine at student-project scale.
  const { data: applications } = await supabase.from("applications").select("user_id");
  const countByUser = {};
  (applications || []).forEach((a) => {
    countByUser[a.user_id] = (countByUser[a.user_id] || 0) + 1;
  });

  allBeneficiaries = (profiles || []).map((p) => ({ ...p, applicationCount: countByUser[p.id] || 0 }));
  renderTable(allBeneficiaries);
}

function renderTable(rows) {
  const body = document.querySelector("#beneficiaries-table-body");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5">No beneficiaries match your search.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (p) => `
    <tr>
      <td>${p.first_name} ${p.last_name}<div class="hint">${p.id_number || ""}</div></td>
      <td>${p.phone || "—"}<div class="hint">${p.email || ""}</div></td>
      <td>${new Date(p.created_at).toLocaleDateString()}</td>
      <td>${p.applicationCount}</td>
      <td><a href="dashboard.html?search=${encodeURIComponent(p.first_name + " " + p.last_name)}" class="btn btn-outline btn-sm">View applications</a></td>
    </tr>`
    )
    .join("");
}

function wireToolbar() {
  const searchInput = document.querySelector("#search-input");
  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    const rows = !term
      ? allBeneficiaries
      : allBeneficiaries.filter((p) => {
          const name = `${p.first_name} ${p.last_name}`.toLowerCase();
          return name.includes(term) || (p.id_number || "").includes(term) || (p.email || "").toLowerCase().includes(term);
        });
    renderTable(rows);
  });
}

init();
