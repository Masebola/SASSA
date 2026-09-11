// =============================================================
// Shared navigation behaviour, included on every page.
// Handles the mobile menu toggle and swaps the Login/Register
// links for Dashboard/Log out once a session exists.
// =============================================================

import { supabase, isConfigured } from "./supabaseClient.js";

function initMobileToggle() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelector("[data-nav-links]");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

async function initAuthAwareLinks() {
  const guestSlot = document.querySelector("[data-nav-guest]");
  const memberSlot = document.querySelector("[data-nav-member]");
  if (!guestSlot && !memberSlot) return;
  if (!isConfigured()) return; // keep default markup until Supabase keys are set

  const { data } = await supabase.auth.getSession();
  const loggedIn = !!data.session;

  if (guestSlot) guestSlot.style.display = loggedIn ? "none" : "flex";
  if (memberSlot) memberSlot.style.display = loggedIn ? "flex" : "none";
}

// Wired up unconditionally: pages that are always in a signed-in
// context (the beneficiary dashboard, every admin page) still need
// their "Log out" link to work even though they have no guest/member
// slots to toggle. The redirect target is passed in per page because
// admin pages live one folder deeper than everything else.
function initLogoutButton() {
  const logoutBtn = document.querySelector("[data-logout]");
  if (!logoutBtn) return;
  const redirectTo = logoutBtn.dataset.logout || "index.html";
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = redirectTo;
  });
}

initMobileToggle();
initAuthAwareLinks();
initLogoutButton();
