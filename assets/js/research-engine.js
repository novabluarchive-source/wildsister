// ============================================================
// WILD SISTER
// SID Research Engine
// Version 1.0
// ============================================================

(function (global) {
    "use strict";

    const client =
        global.supabaseClient ||
        global.wildSisterSupabase;

    if (!client) {
        console.error("Supabase client not found.");
        return;
    }

    const TABLES = {
        reports: "research_reports",
        sections: "research_report_sections",
        evidence: "research_evidence",
        sources: "research_sources",
        connections: "research_connections",
        timeline: "research_timeline"
    };

    function slugify(text) {
        return String(text || "")
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    }

    async function currentUser() {

        const {
            data,
            error
        } = await client.auth.getUser();

        if (error) throw error;

        return data.user;
    }
      async function nextReportNumber() {

        const { data, error } = await client
            .from(TABLES.reports)
            .select("report_code")
            .order("created_at", { ascending:false });

        if(error) throw error;

        let highest = 0;

        (data || []).forEach(r=>{

            const m = String(r.report_code || "")
                .match(/RPT-(\d+)/);

            if(m){

                highest = Math.max(
                    highest,
                    Number(m[1])
                );

            }

        });

        return "RPT-" +
            String(highest + 1).padStart(3,"0");

    }
      async function getReports(){

        const { data, error } =
            await client
                .from(TABLES.reports)
                .select("*")
                .order("updated_at",
                    {ascending:false});

        if(error) throw error;

        return data || [];

    }
      async function getReport(id){

        const { data, error } =
            await client
                .from(TABLES.reports)
                .select("*")
                .eq("id",id)
                .single();

        if(error) throw error;

        return data;

    }
      global.ResearchEngine = {

        getReports,

        getReport,

        nextReportNumber,

        currentUser,

        slugify

    };

})(window);
