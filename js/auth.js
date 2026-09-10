// =============================================================
// Authentication logic: register, log in, and protect pages
// that require a session (e.g. dashboard.html).
//
// This file is imported by register.html, login.html and any
// page that should redirect a signed-out visitor to login.html.
// =============================================================

import { supabase, isConfigured } from "./supabaseClient.js";

function showMessage(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("error", "success");
  el.classList.add("show", type);
}

function configWarning(el) {
  showMessage(
    el,
    "Supabase is not configured yet. Add your project URL and anon key to js/supabaseClient.js first.",
    "error"
  );
}

// ---------- Registration (register.html) ----------
export function initRegisterForm() {
  const form = document.querySelector("#register-form");
  if (!form) return;
  const messageEl = document.querySelector("#form-message");
  const submitBtn = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isConfigured()) return configWarning(messageEl);

    const formData = new FormData(form);
    const email = formData.get("email");
    const password = formData.get("password");
    const firstName = formData.get("first_name");
    const lastName = formData.get("last_name");
    const idNumber = formData.get("id_number");
    const phone = formData.get("phone");
    const address = formData.get("address");

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      showMessage(messageEl, error.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
      return;
    }

    // Create the matching profile row. If email confirmation is
    // enabled in your Supabase project, data.user will exist but
    // data.session may be null until the user confirms their email.
    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        id_number: idNumber,
        phone,
        email,
        address,
        role: "beneficiary",
      });
      if (profileError) {
        showMessage(messageEl, `Account created, but profile setup failed: ${profileError.message}`, "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Create account";
        return;
      }
    }

    showMessage(messageEl, "Account created. Redirecting to sign in...", "success");
    setTimeout(() => (window.location.href = "login.html"), 1200);
  });
}

// ---------- Login (login.html) ----------
export function initLoginForm() {
  const form = document.querySelector("#login-form");
  if (!form) return;
  const messageEl = document.querySelector("#form-message");
  const submitBtn = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isConfigured()) return configWarning(messageEl);

    const formData = new FormData(form);
    const email = formData.get("email");
    const password = formData.get("password");

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showMessage(messageEl, error.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
      return;
    }

    // Route by role: an administrator profile goes to the admin
    // dashboard, a beneficiary goes to the regular dashboard.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    window.location.href = profile?.role === "admin" ? "admin/dashboard.html" : "dashboard.html";
  });
}

// ---------- Page protection (dashboard.html, admin pages, etc.) ----------
// Call this at the top of any page that should only be visible to
// a signed-in user. Redirects to login.html if there is no session.
export async function requireSession() {
  if (!isConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }
  return data.session;
}

initRegisterForm();
initLoginForm();
