// =============================================================
// Beneficiary dashboard: loads the signed-in user's profile,
// most recent application, and unread notification count.
//
// This is scaffolded to render sensible empty states now, and to
// start showing real data as soon as the applications/payments/
// notifications tables are populated (via the application wizard
// and admin dashboard, built next).
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
const PAYMENT_BADGE = { scheduled: "badge-info", processing: "badge-warning", completed: "badge-success" };

async function loadDashboard() {
  const session = await requireSession();
  if (!session) return; // requireSession already redirected to login.html

  const userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", userId)
    .single();

  const welcomeEl = document.querySelector("[data-welcome-name]");
  if (welcomeEl && profile?.first_name) {
    welcomeEl.textContent = `Welcome, ${profile.first_name}`;
  }

  const { data: applications } = await supabase
    .from("applications")
    .select("id, reference_number, status, grant_types(name)")
    .eq("user_id", userId)
    .order("application_date", { ascending: false })
    .limit(1);

  renderApplicationCard(applications && applications[0]);

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, status")
    .eq("beneficiary_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  renderPaymentsCard(payments && payments[0]);

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  renderNotificationsCard(unreadCount || 0);
}

function renderApplicationCard(application) {
  const el = document.querySelector("[data-application-card]");
  if (!el) return;

  if (!application) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="icon">📝</div>
        <p>You haven't started an application yet.</p>
        <a href="apply.html" class="btn btn-primary btn-sm">Apply for a grant</a>
      </div>`;
    return;
  }

  el.innerHTML = `
    <h3>My Application</h3>
    <p>${application.grant_types?.name || "Grant application"}</p>
    <span class="badge ${STATUS_BADGE[application.status] || "badge-neutral"}">${application.status.replace(/_/g, " ")}</span>
    <div style="margin-top:14px;">
      <a href="application-status.html?id=${application.id}" class="btn btn-outline btn-sm">View details</a>
    </div>`;
}

function renderPaymentsCard(payment) {
  const el = document.querySelector("[data-payments-card]");
  if (!el) return;

  if (!payment) {
    el.innerHTML = `
      <h3>Payments</h3>
      <p>No payments yet.</p>
      <a href="payments.html" class="btn btn-outline btn-sm">View payments</a>`;
    return;
  }

  el.innerHTML = `
    <h3>Payments</h3>
    <p>R${payment.amount}</p>
    <span class="badge ${PAYMENT_BADGE[payment.status] || "badge-neutral"}">${payment.status}</span>
    <div style="margin-top:14px;">
      <a href="payments.html" class="btn btn-outline btn-sm">View payments</a>
    </div>`;
}

function renderNotificationsCard(unreadCount) {
  const el = document.querySelector("[data-notifications-card]");
  if (!el) return;

  el.innerHTML = `
    <h3>Notifications</h3>
    <p>${unreadCount > 0 ? `${unreadCount} new notification${unreadCount === 1 ? "" : "s"}` : "You're all caught up."}</p>
    <a href="notifications.html" class="btn btn-outline btn-sm">View</a>`;
}

loadDashboard();
