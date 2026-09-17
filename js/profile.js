// =============================================================
// Profile management: lets a beneficiary view and update their
// own details. The email address is shown read-only because it
// is the account's login identity and lives in Supabase Auth,
// not in the profiles table.
// =============================================================

import { supabase } from "./supabaseClient.js";
import { requireSession } from "./auth.js";

let session = null;

async function init() {
  session = await requireSession();
  if (!session) return;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    showMessage(`We couldn't load your profile${error ? `: ${error.message}` : "."}`, "error");
    return;
  }

  populateForm(profile);
  document.querySelector("#profile-form").addEventListener("submit", handleSave);
}

function populateForm(profile) {
  const form = document.querySelector("#profile-form");
  form.first_name.value = profile.first_name || "";
  form.last_name.value = profile.last_name || "";
  form.id_number.value = profile.id_number || "";
  form.date_of_birth.value = profile.date_of_birth || "";
  form.phone.value = profile.phone || "";
  form.address.value = profile.address || "";
  document.querySelector("#email-display").value = profile.email || session.user.email || "";

  document.querySelector("#profile-loading").style.display = "none";
  document.querySelector("#profile-form").style.display = "block";
}

async function handleSave(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector("button[type=submit]");

  const updates = {
    first_name: form.first_name.value.trim(),
    last_name: form.last_name.value.trim(),
    id_number: form.id_number.value.trim(),
    date_of_birth: form.date_of_birth.value || null,
    phone: form.phone.value.trim(),
    address: form.address.value.trim(),
  };

  if (!updates.first_name || !updates.last_name || !updates.id_number) {
    showMessage("Name and ID number cannot be left empty.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  const { error } = await supabase.from("profiles").update(updates).eq("id", session.user.id);

  submitBtn.disabled = false;
  submitBtn.textContent = "Save changes";

  if (error) {
    showMessage(`Could not save your changes: ${error.message}`, "error");
    return;
  }
  showMessage("Your profile has been updated.", "success");
}

function showMessage(text, type) {
  const el = document.querySelector("#form-message");
  el.textContent = text;
  el.classList.remove("error", "success");
  el.classList.add("show", type);
}

init();
