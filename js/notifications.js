// =============================================================
// Notifications: everything the system has told this beneficiary
// (application submitted, documents required, decisions, payment
// updates), with the ability to mark items as read.
// =============================================================

import { supabase } from "./supabaseClient.js";
import { requireSession } from "./auth.js";

let session = null;

async function init() {
  session = await requireSession();
  if (!session) return;
  await loadAndRender();
  document.querySelector("#mark-all-read")?.addEventListener("click", markAllRead);
}

async function loadAndRender() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  render(error ? [] : data, error);
}

function render(notifications, error) {
  const el = document.querySelector("#notifications-list");
  const markAllBtn = document.querySelector("#mark-all-read");

  if (error) {
    el.innerHTML = `<div class="card empty-state"><p>Could not load your notifications: ${error.message}</p></div>`;
    return;
  }

  if (!notifications.length) {
    el.innerHTML = `
      <div class="card empty-state">
        <div class="icon">🔔</div>
        <p>No notifications yet.</p>
        <a href="dashboard.html" class="btn btn-outline btn-sm">Back to dashboard</a>
      </div>`;
    if (markAllBtn) markAllBtn.style.display = "none";
    return;
  }

  const hasUnread = notifications.some((n) => !n.is_read);
  if (markAllBtn) markAllBtn.style.display = hasUnread ? "inline-flex" : "none";

  el.innerHTML = notifications.map(renderItem).join("");

  el.querySelectorAll("[data-mark-read]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", btn.dataset.markRead);
      loadAndRender();
    });
  });
}

function renderItem(n) {
  return `
  <div class="card notif-item ${n.is_read ? "" : "unread"}" style="margin-bottom:14px;">
    <div class="notif-head">
      <h4>${n.title}${n.is_read ? "" : ' <span class="badge badge-info" style="margin-left:6px;">New</span>'}</h4>
      <span class="notif-date">${new Date(n.created_at).toLocaleString()}</span>
    </div>
    <p class="mb-0">${n.message}</p>
    ${n.is_read ? "" : `<button class="btn btn-outline btn-sm" data-mark-read="${n.id}" style="margin-top:10px;">Mark as read</button>`}
  </div>`;
}

async function markAllRead() {
  await supabase.from("notifications").update({ is_read: true }).eq("user_id", session.user.id).eq("is_read", false);
  loadAndRender();
}

init();
