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

  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      window.location.href = "index.html";
    });
  }
}

initMobileToggle();
initAuthAwareLinks();
