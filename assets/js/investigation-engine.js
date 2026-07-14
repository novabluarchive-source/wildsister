// ======================================================
// WILD SISTER
// INVESTIGATION ENGINE
// Version 1.0
// ======================================================

window.InvestigationEngine = (function () {

  const db = () => window.supabaseClient;

  // -----------------------------
  // CASES
  // -----------------------------

  async function createCase(caseData) {
    return await db()
      .from("cases")
      .insert(caseData)
      .select()
      .single();
  }

  async function getCase(caseId) {
    return await db()
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .single();
  }

  async function getCases(userId) {
    return await db()
      .from("cases")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
  }

  async function updateCase(caseId, updates) {
    return await db()
      .from("cases")
      .update(updates)
      .eq("id", caseId)
      .select()
      .single();
  }

  async function closeCase(caseId) {
    return updateCase(caseId, {
      status: "closed"
    });
  }

  async function reopenCase(caseId) {
    return updateCase(caseId, {
      status: "active"
    });
  }

  // -----------------------------
  // EVIDENCE
  // -----------------------------

  async function saveEvidence(evidence) {
    return await db()
      .from("case_evidence")
      .insert(evidence);
  }

  async function getEvidence(caseId) {
    return await db()
      .from("case_evidence")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at");
  }

  // -----------------------------
  // REPORTS
  // -----------------------------

  async function saveReport(report) {
    return await db()
      .from("case_reports")
      .insert(report);
  }

  async function getReports(caseId) {
    return await db()
      .from("case_reports")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at");
  }

  // -----------------------------
  // ANALYSTS
  // -----------------------------

  async function assignAnalyst(assignment) {
    return await db()
      .from("case_analysts")
      .insert(assignment);
  }

  async function getAnalysts(caseId) {
    return await db()
      .from("case_analysts")
      .select("*")
      .eq("case_id", caseId);
  }

  // -----------------------------
  // MESSAGES
  // -----------------------------

  async function saveMessage(message) {
    return await db()
      .from("case_messages")
      .insert(message);
  }

  async function getMessages(caseId) {
    return await db()
      .from("case_messages")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at");
  }

  // -----------------------------
  // PUBLIC API
  // -----------------------------

  return {

    createCase,

    getCase,

    getCases,

    updateCase,

    closeCase,

    reopenCase,

    saveEvidence,

    getEvidence,

    saveReport,

    getReports,

    assignAnalyst,

    getAnalysts,

    saveMessage,

    getMessages

  };

})();
