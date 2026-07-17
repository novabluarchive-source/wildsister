// ==========================================================
// WILD SISTER
// INVESTIGATION ENGINE
// Shared case management for the SID platform
// ==========================================================

(function (window) {
  "use strict";

  const InvestigationEngine = {

    async getCases() {
      const { data, error } = await supabaseClient
        .from("cases")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      return data || [];
    },

    async getCase(caseId) {
      const { data, error } = await supabaseClient
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .single();

      if (error) throw error;

      return data;
    },

    async createCase(caseData) {

      const { data, error } = await supabaseClient
        .from("cases")
        .insert(caseData)
        .select()
        .single();

      if (error) throw error;

      return data;
    },

    async updateCase(caseId, updates) {

      const { data, error } = await supabaseClient
        .from("cases")
        .update(updates)
        .eq("id", caseId)
        .select()
        .single();

      if (error) throw error;

      return data;
    },

    async getEvidence(caseId) {

      const { data, error } = await supabaseClient
        .from("case_evidence")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at");

      if (error) throw error;

      return data || [];
    },

    async getReports(caseId) {

      const { data, error } = await supabaseClient
        .from("case_reports")
        .select("*")
        .eq("case_id", caseId);

      if (error) throw error;

      return data || [];
    },

    async getMessages(caseId) {

      const { data, error } = await supabaseClient
        .from("case_messages")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at");

      if (error) throw error;

      return data || [];
    },

    async getAnalysts(caseId) {

      const { data, error } = await supabaseClient
        .from("case_analysts")
        .select("*")
        .eq("case_id", caseId);

      if (error) throw error;

      return data || [];
    },

    async loadCaseBundle(caseId) {

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
        evidence,
        reports,
        analysts,
        messages
      };
    }

  };

  window.InvestigationEngine = InvestigationEngine;

})(window);
