// =============================================================
// Pre-screening engine
//
// Pure logic: takes a grant's requirements (rows from the
// grant_requirements table) plus the applicant's answers, and
// returns a screening outcome. Nothing in this file talks to
// Supabase or the DOM, so it can be reasoned about (or unit
// tested) independently of the wizard UI in apply.js.
//
// Design principle (see SRS §8): a hard, unambiguous rule (like
// a minimum age) can automatically flag "potentially ineligible".
// Anything requiring judgement (means test, disability
// assessment, caregiver relationship, foster status, care
// dependency) is never auto-rejected — it always routes to
// "further assessment required" instead.
// =============================================================

// Maps a requirement_type to the key on the `answers` object that
// holds the applicant's value for it. Requirements not listed here
// are treated as manual/judgement calls regardless of `operator`.
const ANSWER_KEY_BY_REQUIREMENT = {
  age_min: "age",
  age_max: "age",
  child_age_max: "child_age",
  institution_resident: "institution_resident",
};

// Plain-language reasons shown when a hard requirement fails.
const HARD_FAIL_REASONS = {
  age_min: "You do not currently meet the minimum age requirement for this grant.",
  age_max: "You do not currently meet the age requirement for this grant.",
  child_age_max: "The child does not meet the age requirement for this grant.",
  institution_resident:
    "This grant is not available to applicants who are currently resident in a state institution.",
};

// Human labels for requirements that route to manual assessment,
// shown so the applicant understands *why* further assessment is needed.
const MANUAL_LABELS = {
  means_test: "Means test",
  disability_assessment: "Disability assessment",
  caregiver_relationship: "Caregiver relationship confirmation",
  foster_status: "Foster care status confirmation",
  care_dependency_assessment: "Care dependency assessment",
};

function compare(operator, answerValue, requirementValue) {
  if (answerValue === undefined || answerValue === null) return null; // can't evaluate — treat as manual
  switch (operator) {
    case ">=":
      return Number(answerValue) >= Number(requirementValue);
    case "<=":
      return Number(answerValue) <= Number(requirementValue);
    case "=":
      return String(answerValue) === String(requirementValue);
    default:
      return null;
  }
}

/**
 * @param {Array} requirements - rows from grant_requirements for one grant
 * @param {Object} answers - { age, child_age, institution_resident, ... }
 * @returns {{ result: 'potentially_eligible'|'potentially_ineligible'|'further_assessment_required',
 *             reason: string|null, manualItems: string[] }}
 */
export function runScreening(requirements, answers) {
  const manualItems = [];

  for (const req of requirements) {
    if (req.operator === "manual" || !ANSWER_KEY_BY_REQUIREMENT[req.requirement_type]) {
      if (req.requires_manual_assessment) {
        manualItems.push(MANUAL_LABELS[req.requirement_type] || req.requirement_type);
      }
      continue;
    }

    const answerKey = ANSWER_KEY_BY_REQUIREMENT[req.requirement_type];
    const outcome = compare(req.operator, answers[answerKey], req.value);

    if (outcome === false && req.severity === "hard") {
      return {
        result: "potentially_ineligible",
        reason: HARD_FAIL_REASONS[req.requirement_type] || "You do not currently meet a requirement for this grant.",
        manualItems: [],
      };
    }
    if (outcome === false && req.severity === "soft") {
      manualItems.push(MANUAL_LABELS[req.requirement_type] || req.requirement_type);
    }
    if (outcome === null && req.requires_manual_assessment) {
      manualItems.push(MANUAL_LABELS[req.requirement_type] || req.requirement_type);
    }
  }

  if (manualItems.length > 0) {
    return { result: "further_assessment_required", reason: null, manualItems };
  }
  return { result: "potentially_eligible", reason: null, manualItems: [] };
}

export function calculateAge(dateOfBirthString) {
  const dob = new Date(dateOfBirthString);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}
