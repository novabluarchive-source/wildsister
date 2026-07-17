// ==========================================================
// WILD SISTER // SID
// INVESTIGATION ENGINE
// Shared Supabase case-management layer
// ==========================================================

(function (global) {
  "use strict";

  // ----------------------------------------------------------
  // INTERNAL HELPERS
  // ----------------------------------------------------------

  function getClient() {
    if (!global.supabaseClient) {
      throw new Error("SUPABASE CLIENT NOT LOADED");
    }

    return global.supabaseClient;
  }

  function requireCaseId(caseId) {
    if (!caseId) {
      throw new Error("CASE ID IS REQUIRED");
    }
  }

  function requireObject(value, label) {
    if (!value || typeof value !== "object") {
      throw new Error((label || "DATA") + " IS REQUIRED");
    }
  }

  // ----------------------------------------------------------
  // INVESTIGATION ENGINE
  // ----------------------------------------------------------

  const InvestigationEngine = {

    // ========================================================
    // CASES
    // ========================================================

    async getCases() {
      const client = getClient();

      const { data, error } = await client
        .from("cases")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    },

    async getCase(caseId) {
      requireCaseId(caseId);

      const client = getClient();

      const { data, error } = await client
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async createCase(caseData) {
      requireObject(caseData, "CASE DATA");

      const client = getClient();

      const payload = {
        case_number: caseData.case_number,
        subject: caseData.subject || "UNNAMED CASE",
        primary_question: caseData.primary_question || "",
        urgency: caseData.urgency || "STANDARD",
        lead_division: caseData.lead_division || "PATTERN",
        status: caseData.status || "active",
        current_finding: caseData.current_finding || null
      };

      const { data, error } = await client
        .from("cases")
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async updateCase(caseId, updates) {
      requireCaseId(caseId);
      requireObject(updates, "CASE UPDATES");

      const client = getClient();

      const payload = Object.assign({}, updates, {
        updated_at: new Date().toISOString()
      });

      const { data, error } = await client
        .from("cases")
        .update(payload)
        .eq("id", caseId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    // ========================================================
    // EVIDENCE
    // ========================================================

    async saveEvidence(caseId, evidenceData) {
      requireCaseId(caseId);
      requireObject(evidenceData, "EVIDENCE DATA");

      const client = getClient();

      const payload = {
        case_id: caseId,
        type: evidenceData.type || "general",
        content: evidenceData.content || ""
      };

      const { data, error } = await client
        .from("case_evidence")
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async addEvidence(caseId, evidenceData) {
      return this.saveEvidence(caseId, evidenceData);
    },

    async getEvidence(caseId) {
      requireCaseId(caseId);

      const client = getClient();

      const { data, error } = await client
        .from("case_evidence")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    },

    // ========================================================
    // MESSAGES
    // ========================================================

    async saveMessage(caseId, messageData) {
      requireCaseId(caseId);
      requireObject(messageData, "MESSAGE DATA");

      const client = getClient();

      const payload = {
        case_id: caseId,
        role: messageData.role || "assistant",
        analyst: messageData.analyst || "SID",
        content: messageData.content || ""
      };

      const { data, error } = await client
        .from("case_messages")
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async addMessage(caseId, messageData) {
      return this.saveMessage(caseId, messageData);
    },

    async getMessages(caseId) {
      requireCaseId(caseId);

      const client = getClient();

      const { data, error } = await client
        .from("case_messages")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    },

    // ========================================================
    // REPORTS
    // ========================================================

    async saveReport(caseId, reportData) {
      requireCaseId(caseId);
      requireObject(reportData, "REPORT DATA");

      const client = getClient();

      const payload = {
        case_id: caseId,
        analyst: reportData.analyst || "SID",
        report_type:
          reportData.reportType ||
          reportData.report_type ||
          "case_log",
        content: reportData.content || ""
      };

      const { data, error } = await client
        .from("case_reports")
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async addReport(caseId, reportData) {
      return this.saveReport(caseId, reportData);
    },

    async getReports(caseId) {
      requireCaseId(caseId);

      const client = getClient();

      const { data, error } = await client
        .from("case_reports")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    },

    // ========================================================
    // ANALYST ASSIGNMENTS
    // ========================================================

    async assignAnalyst(caseId, analystData) {
      requireCaseId(caseId);
      requireObject(analystData, "ANALYST DATA");

      if (!analystData.analyst) {
        throw new Error("ANALYST NAME IS REQUIRED");
      }

      const client = getClient();

      const payload = {
        case_id: caseId,
        analyst: analystData.analyst,
        role: analystData.role || "support"
      };

      const { data, error } = await client
        .from("case_analysts")
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async getAnalysts(caseId) {
      requireCaseId(caseId);

      const client = getClient();

      const { data, error } = await client
        .from("case_analysts")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    },

    // ========================================================
    // COMPLETE CASE BUNDLE
    // ========================================================

    async loadCaseBundle(caseId) {
      requireCaseId(caseId);

      const [
        caseFile,
        evidence,
        reports,
        analysts,
        messages
      ] = await Promise.all([
        this.getCase(caseId),
        this.getEvidence(caseId),
        this.getReports(caseId),
        this.getAnalysts(caseId),
        this.getMessages(caseId)
      ]);

      return {
        case: caseFile,
        evidence: evidence,
        reports: reports,
        analysts: analysts,
        messages: messages
      };
    }

  };

  global.InvestigationEngine = InvestigationEngine;

})(window);
