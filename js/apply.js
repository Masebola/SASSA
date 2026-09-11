// =============================================================
// Application wizard glue code.
// Fetches data from Supabase, drives step navigation, calls the
// pure screening engine (screening.js), and performs the final
// submit (application row + document uploads + notification).
// =============================================================

import { supabase } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import { runScreening, calculateAge } from "./screening.js";

// ---- per-grant field configuration ----------------------------
// Quick-check fields feed the automated screening decision.
// Additional-info fields are informational only (stored in
// applications.details for the administrator to see).
const QUICK_CHECK_FIELDS_BY_GRANT = {
  "Older Person's Grant": [
    { key: "institution_resident", label: "I am currently resident in a state institution or care facility", type: "checkbox" },
  ],
  "Child Support Grant": [
    { key: "child_date_of_birth", label: "Child's date of birth", type: "date", required: true },
  ],
};

const ADDITIONAL_FIELDS_BY_GRANT = {
  "Older Person's Grant": [
    { key: "notes", label: "Additional information for the assessor (optional)", type: "textarea" },
  ],
  "Disability Grant": [
    { key: "nature_of_disability", label: "Describe the nature of the disability", type: "textarea", required: true },
  ],
  "Child Support Grant": [
    { key: "child_full_name", label: "Child's full name", type: "text", required: true },
    { key: "caregiver_relationship", label: "Your relationship to the child", type: "select",
      options: ["Biological parent", "Legal guardian", "Other family caregiver"], required: true },
  ],
  "Foster Child Grant": [
    { key: "child_full_name", label: "Child's full name", type: "text", required: true },
    { key: "foster_order_reference", label: "Foster care order reference number", type: "text", required: true },
  ],
  "Care Dependency Grant": [
    { key: "child_full_name", label: "Child's full name", type: "text", required: true },
    { key: "child_date_of_birth", label: "Child's date of birth", type: "date", required: true },
    { key: "nature_of_care_need", label: "Describe the nature of the care need", type: "textarea", required: true },
  ],
};

const STEP_LABELS = ["Personal", "Grant", "Screening", "Details", "Documents", "Review"];

const state = {
  session: null,
  profile: null,
  grantTypes: [],
  selectedGrant: null,
  requirements: [],
  quickCheck: {},
  screening: null,
  details: {},
  documents: [],
  files: {},
  currentStep: 1,
};

// ---------- bootstrap ----------
async function init() {
  state.session = await requireSession();
  if (!state.session) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .single();
  state.profile = profile;

  const { data: grantTypes } = await supabase
    .from("grant_types")
    .select("*")
    .eq("active", true)
    .order("name");
  state.grantTypes = grantTypes || [];

  renderPersonalStep();
  renderGrantStep();
  renderStepper();
  wireNavButtons();
  goToStep(1);
}

// ---------- stepper ----------
function renderStepper() {
  const el = document.querySelector("#stepper");
  el.innerHTML = STEP_LABELS.map((label, i) => {
    const n = i + 1;
    const cls = n < state.currentStep ? "done" : n === state.currentStep ? "current" : "";
    return `<li class="${cls}"><span class="num">${n < state.currentStep ? "✓" : n}</span>${label}</li>`;
  }).join("");
}

function goToStep(n) {
  state.currentStep = n;
  document.querySelectorAll(".wizard-step").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.step) === n);
  });
  renderStepper();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireNavButtons() {
  document.querySelectorAll("[data-next]").forEach((btn) =>
    btn.addEventListener("click", () => handleNext(Number(btn.dataset.next)))
  );
  document.querySelectorAll("[data-back]").forEach((btn) =>
    btn.addEventListener("click", () => goToStep(Number(btn.dataset.back)))
  );
}

async function handleNext(targetStep) {
  const from = state.currentStep;

  if (from === 1) {
    if (!validatePersonalStep()) return;
  }
  if (from === 2) {
    if (!state.selectedGrant) {
      showStepError("grant-error", "Please select a grant to continue.");
      return;
    }
    await runScreeningStep();
    goToStep(3);
    return;
  }
  if (from === 4) {
    if (!collectAdditionalInfo()) return;
    renderDocumentsStep();
  }
  if (from === 5) {
    if (!validateDocumentsStep()) return;
    renderReviewStep();
  }

  goToStep(targetStep);
}

// ---------- Step 1: Personal information ----------
function renderPersonalStep() {
  const el = document.querySelector("#personal-summary");
  const p = state.profile || {};
  const hasDob = !!p.date_of_birth;

  el.innerHTML = `
    <ul class="review-list">
      <li><span class="k">Name</span><span class="v">${p.first_name || ""} ${p.last_name || ""}</span></li>
      <li><span class="k">ID number</span><span class="v">${p.id_number || "—"}</span></li>
      <li><span class="k">Phone</span><span class="v">${p.phone || "—"}</span></li>
      <li><span class="k">Address</span><span class="v">${p.address || "—"}</span></li>
    </ul>
    ${hasDob
      ? `<p style="margin-top:14px;">Date of birth on file: <strong>${p.date_of_birth}</strong></p>`
      : `<div class="field" style="margin-top:14px;">
           <label for="dob-fill">Date of birth</label>
           <input type="date" id="dob-fill" required />
           <span class="hint">We don't have this on file yet — it's needed to check age-based requirements.</span>
         </div>`
    }
    <p class="hint">To change your name, ID number, phone or address, update your <a href="profile.html">profile</a> first.</p>
  `;
}

function validatePersonalStep() {
  if (!state.profile?.date_of_birth) {
    const input = document.querySelector("#dob-fill");
    if (!input || !input.value) {
      showStepError("personal-error", "Please enter your date of birth to continue.");
      return false;
    }
    state.profile.date_of_birth = input.value;
    // Save it back to the profile for next time.
    supabase.from("profiles").update({ date_of_birth: input.value }).eq("id", state.session.user.id);
  }
  clearStepError("personal-error");
  return true;
}

// ---------- Step 2: Grant selection ----------
function renderGrantStep() {
  const el = document.querySelector("#grant-list");
  el.innerHTML = state.grantTypes
    .map(
      (g) => `
    <label class="grant-radio-card" data-grant-card="${g.id}">
      <input type="radio" name="grant" value="${g.id}" />
      <div>
        <h4>${g.name}</h4>
        <p>${g.description || ""}</p>
      </div>
    </label>`
    )
    .join("");

  el.querySelectorAll('input[name="grant"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.selectedGrant = state.grantTypes.find((g) => g.id === input.value);
      el.querySelectorAll(".grant-radio-card").forEach((card) =>
        card.classList.toggle("selected", card.dataset.grantCard === input.value)
      );
      clearStepError("grant-error");
    });
  });
}

// ---------- Step 3: Screening ----------
async function runScreeningStep() {
  const grantName = state.selectedGrant.name;
  const quickFields = QUICK_CHECK_FIELDS_BY_GRANT[grantName] || [];

  // Render the minimal quick-check fields needed for this grant's hard rules.
  const quickEl = document.querySelector("#quick-check-fields");
  quickEl.innerHTML = quickFields.length
    ? quickFields.map(renderField).join("")
    : `<p class="hint">No extra information is needed to run the initial check for this grant.</p>`;

  const runBtn = document.querySelector("#run-screening-btn");
  const resultPanel = document.querySelector("#screening-result");
  const continueBtn = document.querySelector("#screening-continue-btn");
  const chooseAnotherBtn = document.querySelector("#screening-choose-another-btn");
  resultPanel.innerHTML = "";
  continueBtn.style.display = "none";
  chooseAnotherBtn.style.display = "none";
  runBtn.style.display = "inline-flex";

  runBtn.onclick = async () => {
    state.quickCheck = collectFieldValues(quickFields, quickEl);

    const { data: requirements } = await supabase
      .from("grant_requirements")
      .select("*")
      .eq("grant_id", state.selectedGrant.id);
    state.requirements = requirements || [];

    const answers = { age: calculateAge(state.profile.date_of_birth) };
    if (grantName === "Older Person's Grant") answers.institution_resident = !!state.quickCheck.institution_resident;
    if (grantName === "Child Support Grant") answers.child_age = calculateAge(state.quickCheck.child_date_of_birth);

    state.screening = runScreening(state.requirements, answers);
    renderScreeningResult();
  };
}

function renderScreeningResult() {
  const resultPanel = document.querySelector("#screening-result");
  const continueBtn = document.querySelector("#screening-continue-btn");
  const chooseAnotherBtn = document.querySelector("#screening-choose-another-btn");
  const runBtn = document.querySelector("#run-screening-btn");
  const { result, reason, manualItems } = state.screening;

  if (result === "potentially_ineligible") {
    resultPanel.innerHTML = `
      <div class="screening-panel ineligible">
        <span class="badge badge-danger">Potentially ineligible</span>
        <h3 style="margin-top:10px;">This grant may not be a match right now</h3>
        <p>${reason}</p>
      </div>`;
    chooseAnotherBtn.style.display = "inline-flex";
    continueBtn.style.display = "none";
  } else if (result === "further_assessment_required") {
    resultPanel.innerHTML = `
      <div class="screening-panel assessment">
        <span class="badge badge-warning">Further assessment required</span>
        <h3 style="margin-top:10px;">Your initial criteria are met</h3>
        <p>This grant requires additional assessment before a final decision, based on:</p>
        <ul>${manualItems.map((m) => `<li>${m}</li>`).join("")}</ul>
      </div>`;
    continueBtn.style.display = "inline-flex";
    chooseAnotherBtn.style.display = "none";
  } else {
    resultPanel.innerHTML = `
      <div class="screening-panel eligible">
        <span class="badge badge-success">Potentially eligible</span>
        <h3 style="margin-top:10px;">You meet the initial criteria for this grant</h3>
        <p>You can continue with your application. A final decision is still made by an administrator.</p>
      </div>`;
    continueBtn.style.display = "inline-flex";
    chooseAnotherBtn.style.display = "none";
  }
  runBtn.style.display = "none";
}

document.addEventListener("click", (e) => {
  if (e.target.id === "screening-choose-another-btn") {
    state.selectedGrant = null;
    state.screening = null;
    document.querySelectorAll('input[name="grant"]').forEach((i) => (i.checked = false));
    document.querySelectorAll(".grant-radio-card").forEach((c) => c.classList.remove("selected"));
    goToStep(2);
  }
  if (e.target.id === "screening-continue-btn") {
    renderDetailsStep();
    goToStep(4);
  }
});

// ---------- Step 4: Additional information ----------
function renderDetailsStep() {
  const fields = ADDITIONAL_FIELDS_BY_GRANT[state.selectedGrant.name] || [];
  const el = document.querySelector("#details-fields");
  el.innerHTML = fields.length
    ? fields.map(renderField).join("")
    : `<p class="hint">No additional information is required for this grant.</p>`;
}

function collectAdditionalInfo() {
  const fields = ADDITIONAL_FIELDS_BY_GRANT[state.selectedGrant.name] || [];
  const el = document.querySelector("#details-fields");
  const values = collectFieldValues(fields, el);

  const missing = fields.filter((f) => f.required && !values[f.key]);
  if (missing.length) {
    showStepError("details-error", `Please complete: ${missing.map((f) => f.label).join(", ")}`);
    return false;
  }
  clearStepError("details-error");
  state.details = { ...state.quickCheck, ...values };
  return true;
}

// ---------- Step 5: Documents ----------
async function renderDocumentsStepData() {
  const { data } = await supabase
    .from("grant_documents")
    .select("*")
    .eq("grant_id", state.selectedGrant.id);
  state.documents = data || [];
}

function renderDocumentsStep() {
  renderDocumentsStepData().then(() => {
    const el = document.querySelector("#doc-checklist");
    el.innerHTML = state.documents
      .map(
        (d) => `
      <div class="doc-item" data-doc-type="${d.document_type}">
        <div class="doc-item-head">
          <strong>${d.label}${d.required ? "" : " (optional)"}</strong>
          <span class="doc-status-ok" data-doc-status style="display:none;">✓ Selected</span>
        </div>
        <input type="file" data-doc-input />
      </div>`
      )
      .join("");

    el.querySelectorAll("[data-doc-input]").forEach((input) => {
      input.addEventListener("change", () => {
        const type = input.closest(".doc-item").dataset.docType;
        if (input.files[0]) {
          state.files[type] = input.files[0];
          input.closest(".doc-item").querySelector("[data-doc-status]").style.display = "inline";
        }
      });
    });
  });
}

function validateDocumentsStep() {
  const missing = state.documents.filter((d) => d.required && !state.files[d.document_type]);
  if (missing.length) {
    showStepError("documents-error", `Please upload: ${missing.map((d) => d.label).join(", ")}`);
    return false;
  }
  clearStepError("documents-error");
  return true;
}

// ---------- Step 6: Review ----------
function renderReviewStep() {
  const p = state.profile;
  const detailRows = Object.entries(state.details)
    .filter(([, v]) => v !== "" && v !== false)
    .map(([k, v]) => `<li><span class="k">${humanizeKey(k)}</span><span class="v">${v === true ? "Yes" : v}</span></li>`)
    .join("");
  const docRows = Object.entries(state.files)
    .map(([type, file]) => `<li><span class="k">${type.replace(/_/g, " ")}</span><span class="v">${file.name}</span></li>`)
    .join("");

  document.querySelector("#review-summary").innerHTML = `
    <h3>Applicant</h3>
    <ul class="review-list">
      <li><span class="k">Name</span><span class="v">${p.first_name} ${p.last_name}</span></li>
      <li><span class="k">Date of birth</span><span class="v">${p.date_of_birth}</span></li>
    </ul>
    <h3 style="margin-top:20px;">Grant</h3>
    <ul class="review-list">
      <li><span class="k">Selected grant</span><span class="v">${state.selectedGrant.name}</span></li>
      <li><span class="k">Screening result</span><span class="v">${screeningLabel(state.screening.result)}</span></li>
    </ul>
    ${detailRows ? `<h3 style="margin-top:20px;">Additional information</h3><ul class="review-list">${detailRows}</ul>` : ""}
    ${docRows ? `<h3 style="margin-top:20px;">Documents</h3><ul class="review-list">${docRows}</ul>` : ""}
  `;
}

// ---------- Submit ----------
async function submitApplication() {
  const btn = document.querySelector("#submit-application-btn");
  btn.disabled = true;
  btn.textContent = "Submitting...";
  clearStepError("review-error");

  try {
    const referenceNumber = generateReferenceNumber();
    const status = state.screening.result === "further_assessment_required" ? "further_assessment_required" : "submitted";

    const { data: application, error: appError } = await supabase
      .from("applications")
      .insert({
        user_id: state.session.user.id,
        grant_type_id: state.selectedGrant.id,
        reference_number: referenceNumber,
        status,
        screening_result: state.screening.result,
        screening_reason: state.screening.reason,
        details: state.details,
        application_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (appError) throw appError;

    for (const [docType, file] of Object.entries(state.files)) {
      const path = `${state.session.user.id}/${referenceNumber}/${docType}__${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
      if (uploadError) throw new Error(`Could not upload ${docType}: ${uploadError.message}`);

      await supabase.from("documents").insert({
        application_id: application.id,
        document_type: docType,
        file_url: path,
        verification_status: "received",
      });
    }

    await supabase.from("notifications").insert({
      user_id: state.session.user.id,
      title: "Application submitted",
      message:
        status === "further_assessment_required"
          ? `Your application ${referenceNumber} has been submitted and requires further assessment before a decision is made.`
          : `Your application ${referenceNumber} has been received and is awaiting review.`,
    });

    renderConfirmation(referenceNumber, application.id, status);
  } catch (err) {
    showStepError("review-error", err.message || "Something went wrong while submitting your application.");
    btn.disabled = false;
    btn.textContent = "Submit Application";
  }
}

function renderConfirmation(referenceNumber, applicationId, status) {
  document.querySelector("#wizard-container").style.display = "none";
  const el = document.querySelector("#confirmation");
  el.style.display = "block";
  el.innerHTML = `
    <div class="card text-center stack">
      <span class="badge badge-success" style="align-self:center;">Application submitted</span>
      <h2>Thank you — your application is in.</h2>
      <div class="ticket-stub" style="justify-content:center;">
        <div>
          <div class="label">Reference number</div>
          <div class="ref">${referenceNumber}</div>
        </div>
      </div>
      <p>${status === "further_assessment_required"
        ? "Your application requires further assessment. An administrator will follow up if anything else is needed."
        : "Your application is awaiting review by an administrator."}</p>
      <div class="hero-actions" style="justify-content:center;">
        <a href="application-status.html?id=${applicationId}" class="btn btn-primary">View application status</a>
        <a href="dashboard.html" class="btn btn-outline">Back to dashboard</a>
      </div>
    </div>`;
}

// ---------- shared field rendering helpers ----------
function renderField(f) {
  if (f.type === "checkbox") {
    return `<div class="field"><label><input type="checkbox" data-field="${f.key}" style="width:auto; margin-right:8px;" />${f.label}</label></div>`;
  }
  if (f.type === "textarea") {
    return `<div class="field"><label>${f.label}</label><textarea data-field="${f.key}" rows="3" ${f.required ? "required" : ""}></textarea></div>`;
  }
  if (f.type === "select") {
    return `<div class="field"><label>${f.label}</label><select data-field="${f.key}" ${f.required ? "required" : ""}>
      <option value="">Select…</option>
      ${f.options.map((o) => `<option value="${o}">${o}</option>`).join("")}
    </select></div>`;
  }
  return `<div class="field"><label>${f.label}</label><input type="${f.type}" data-field="${f.key}" ${f.required ? "required" : ""} /></div>`;
}

function collectFieldValues(fields, container) {
  const values = {};
  fields.forEach((f) => {
    const el = container.querySelector(`[data-field="${f.key}"]`);
    if (!el) return;
    values[f.key] = f.type === "checkbox" ? el.checked : el.value;
  });
  return values;
}

function humanizeKey(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function screeningLabel(result) {
  return { potentially_eligible: "Potentially eligible", potentially_ineligible: "Potentially ineligible", further_assessment_required: "Further assessment required" }[result] || result;
}

function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `SASSA-${year}-${suffix}`;
}

function showStepError(id, message) {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show", "error");
}
function clearStepError(id) {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.classList.remove("show", "error");
}

document.querySelector("#submit-application-btn")?.addEventListener("click", submitApplication);

init();
