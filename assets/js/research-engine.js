// ============================================================
// WILD SISTER // SID
// RESEARCH ENGINE
// Supabase-backed institutional research management
// ============================================================

(function (global) {
  "use strict";

  // ----------------------------------------------------------
  // TABLE REGISTRY
  // ----------------------------------------------------------

  const TABLES = Object.freeze({
    admins: "research_admins",
    reports: "research_reports",
    sections: "research_report_sections",
    evidence: "research_evidence",
    sources: "research_sources",
    connections: "research_connections",
    timeline: "research_timeline"
  });

  // ----------------------------------------------------------
  // INTERNAL HELPERS
  // ----------------------------------------------------------

  function getClient() {
    const client =
      global.supabaseClient ||
      global.wildSisterSupabase;

    if (!client) {
      throw new Error("SUPABASE CLIENT NOT LOADED");
    }

    return client;
  }

  function requireValue(value, label) {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      throw new Error((label || "VALUE") + " IS REQUIRED");
    }
  }

  function requireObject(value, label) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new Error((label || "DATA") + " IS REQUIRED");
    }
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function slugify(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => cleanText(item))
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/[>,|]/)
        .map((item) => cleanText(item))
        .filter(Boolean);
    }

    return [];
  }

  function normalizeStatus(value) {
    const status = cleanText(value || "draft").toLowerCase();

    const allowed = [
      "draft",
      "active",
      "review",
      "published",
      "archived"
    ];

    return allowed.includes(status)
      ? status
      : "draft";
  }

  function normalizeVisibility(value) {
    const visibility = cleanText(
      value || "private"
    ).toLowerCase();

    const allowed = [
      "private",
      "members",
      "public"
    ];

    return allowed.includes(visibility)
      ? visibility
      : "private";
  }

  function normalizeScore(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(100, Math.round(number))
    );
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      cleanText(value)
    );
  }

  // ----------------------------------------------------------
  // AUTHORIZATION
  // ----------------------------------------------------------

  async function currentUser() {
    const client = getClient();

    const {
      data: { user },
      error
    } = await client.auth.getUser();

    if (error) {
      throw error;
    }

    if (!user) {
      throw new Error("SIGNED-IN USER REQUIRED");
    }

    return user;
  }

  async function isResearchAdmin() {
    const user = await currentUser();
    const client = getClient();

    const { data, error } = await client
      .from(TABLES.admins)
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async function requireResearchAdmin() {
    const allowed = await isResearchAdmin();

    if (!allowed) {
      throw new Error(
        "RESEARCH ADMIN CLEARANCE REQUIRED"
      );
    }

    return true;
  }

  // ----------------------------------------------------------
  // REPORT NUMBERING
  // ----------------------------------------------------------

  async function nextReportNumber() {
    const client = getClient();

    const { data, error } = await client
      .from(TABLES.reports)
      .select("report_code")
      .order("created_at", {
        ascending: false
      })
      .limit(250);

    if (error) {
      throw error;
    }

    let highest = 0;

    (data || []).forEach((row) => {
      const match = String(
        row.report_code || ""
      ).match(/^RPT-(\d+)$/i);

      if (match) {
        highest = Math.max(
          highest,
          Number(match[1])
        );
      }
    });

    return (
      "RPT-" +
      String(highest + 1).padStart(3, "0")
    );
  }

  // Alias for compatibility with older code.
  const nextReportCode = nextReportNumber;

  // ----------------------------------------------------------
  // REPORT QUERIES
  // ----------------------------------------------------------

  async function getReports(options = {}) {
    const client = getClient();

    let query = client
      .from(TABLES.reports)
      .select("*")
      .order("updated_at", {
        ascending: false
      });

    if (options.status) {
      query = query.eq(
        "status",
        normalizeStatus(options.status)
      );
    }

    if (options.visibility) {
      query = query.eq(
        "visibility",
        normalizeVisibility(
          options.visibility
        )
      );
    }

    if (options.publicOnly) {
      query = query
        .eq("status", "published")
        .eq("visibility", "public");
    }

    if (options.leadDivision) {
      query = query.eq(
        "lead_division",
        cleanText(
          options.leadDivision
        ).toUpperCase()
      );
    }

    if (options.search) {
      const search = cleanText(
        options.search
      ).replace(/[%,()]/g, " ");

      if (search) {
        query = query.or(
          [
            `report_code.ilike.%${search}%`,
            `title.ilike.%${search}%`,
            `research_question.ilike.%${search}%`,
            `summary.ilike.%${search}%`
          ].join(",")
        );
      }
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function getReport(identifier) {
    requireValue(
      identifier,
      "REPORT IDENTIFIER"
    );

    const client = getClient();
    const value = cleanText(identifier);

    let query = client
      .from(TABLES.reports)
      .select("*");

    if (isUuid(value)) {
      query = query.eq("id", value);
    } else if (/^RPT-\d+$/i.test(value)) {
      query = query.eq(
        "report_code",
        value.toUpperCase()
      );
    } else {
      query = query.eq("slug", value);
    }

    const { data, error } =
      await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "RESEARCH REPORT NOT FOUND"
      );
    }

    return data;
  }

  // ----------------------------------------------------------
  // CREATE / UPDATE REPORTS
  // ----------------------------------------------------------

  async function createReport(reportData) {
    requireObject(
      reportData,
      "REPORT DATA"
    );

    requireValue(
      reportData.title,
      "REPORT TITLE"
    );

    requireValue(
      reportData.research_question,
      "RESEARCH QUESTION"
    );

    await requireResearchAdmin();

    const client = getClient();
    const user = await currentUser();

    const reportCode =
      cleanText(reportData.report_code) ||
      await nextReportNumber();

    const reportSlug =
      cleanText(reportData.slug) ||
      slugify(reportData.title) ||
      slugify(reportCode);

    const payload = {
      report_code: reportCode,

      slug: reportSlug,

      title: cleanText(
        reportData.title
      ),

      research_question: cleanText(
        reportData.research_question
      ),

      summary: cleanText(
        reportData.summary
      ),

      scope: cleanText(
        reportData.scope
      ),

      lead_division: cleanText(
        reportData.lead_division || "LUX"
      ).toUpperCase(),

      supporting_divisions:
        normalizeArray(
          reportData.supporting_divisions
        ).map((item) =>
          item.toUpperCase()
        ),

      route_steps: normalizeArray(
        reportData.route_steps
      ),

      status: normalizeStatus(
        reportData.status
      ),

      visibility: normalizeVisibility(
        reportData.visibility
      ),

      confidence_label: cleanText(
        reportData.confidence_label ||
        "unresolved"
      ).toLowerCase(),

      confidence_score: normalizeScore(
        reportData.confidence_score
      ),

      current_finding: cleanText(
        reportData.current_finding
      ),

      open_questions: cleanText(
        reportData.open_questions
      ),

      created_by: user.id,

      updated_at:
        new Date().toISOString()
    };

    const { data, error } = await client
      .from(TABLES.reports)
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await addTimeline(
      data.id,
      "report_created",
      data.title
    );

    return data;
  }

  async function updateReport(
    reportId,
    updates
  ) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    requireObject(
      updates,
      "REPORT UPDATES"
    );

    await requireResearchAdmin();

    const client = getClient();
    const payload = {};

    if ("title" in updates) {
      requireValue(
        updates.title,
        "REPORT TITLE"
      );

      payload.title = cleanText(
        updates.title
      );
    }

    if ("research_question" in updates) {
      requireValue(
        updates.research_question,
        "RESEARCH QUESTION"
      );

      payload.research_question =
        cleanText(
          updates.research_question
        );
    }

    if (
      "slug" in updates ||
      "title" in updates
    ) {
      payload.slug =
        cleanText(updates.slug) ||
        slugify(updates.title);
    }

    if ("summary" in updates) {
      payload.summary = cleanText(
        updates.summary
      );
    }

    if ("scope" in updates) {
      payload.scope = cleanText(
        updates.scope
      );
    }

    if ("lead_division" in updates) {
      payload.lead_division =
        cleanText(
          updates.lead_division
        ).toUpperCase();
    }

    if (
      "supporting_divisions" in updates
    ) {
      payload.supporting_divisions =
        normalizeArray(
          updates.supporting_divisions
        ).map((item) =>
          item.toUpperCase()
        );
    }

    if ("route_steps" in updates) {
      payload.route_steps =
        normalizeArray(
          updates.route_steps
        );
    }

    if ("status" in updates) {
      payload.status =
        normalizeStatus(
          updates.status
        );
    }

    if ("visibility" in updates) {
      payload.visibility =
        normalizeVisibility(
          updates.visibility
        );
    }

    if ("confidence_label" in updates) {
      payload.confidence_label =
        cleanText(
          updates.confidence_label
        ).toLowerCase();
    }

    if ("confidence_score" in updates) {
      payload.confidence_score =
        normalizeScore(
          updates.confidence_score
        );
    }

    if ("current_finding" in updates) {
      payload.current_finding =
        cleanText(
          updates.current_finding
        );
    }

    if ("open_questions" in updates) {
      payload.open_questions =
        cleanText(
          updates.open_questions
        );
    }

    payload.updated_at =
      new Date().toISOString();

    const { data, error } = await client
      .from(TABLES.reports)
      .update(payload)
      .eq("id", reportId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await addTimeline(
      reportId,
      "report_updated",
      data.title
    );

    return data;
  }

  async function saveReport(reportData) {
    requireObject(
      reportData,
      "REPORT DATA"
    );

    if (reportData.id) {
      return updateReport(
        reportData.id,
        reportData
      );
    }

    return createReport(reportData);
  }

  async function publishReport(reportId) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    await requireResearchAdmin();

    const client = getClient();

    const { data, error } = await client
      .from(TABLES.reports)
      .update({
        status: "published",
        visibility: "public",
        published_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString()
      })
      .eq("id", reportId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await addTimeline(
      reportId,
      "report_published",
      data.title
    );

    return data;
  }

  async function archiveReport(reportId) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    await requireResearchAdmin();

    const client = getClient();

    const { data, error } = await client
      .from(TABLES.reports)
      .update({
        status: "archived",
        updated_at:
          new Date().toISOString()
      })
      .eq("id", reportId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await addTimeline(
      reportId,
      "report_archived",
      data.title
    );

    return data;
  }

  // ----------------------------------------------------------
  // DIVISION FINDINGS / SECTIONS
  // ----------------------------------------------------------

  async function getSections(reportId) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    const { data, error } = await getClient()
      .from(TABLES.sections)
      .select("*")
      .eq("report_id", reportId)
      .order("position", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function saveSection(
    reportId,
    sectionData
  ) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    requireObject(
      sectionData,
      "SECTION DATA"
    );

    requireValue(
      sectionData.title,
      "SECTION TITLE"
    );

    await requireResearchAdmin();

    const client = getClient();

    const payload = {
      report_id: reportId,

      section_type: cleanText(
        sectionData.section_type ||
        "finding"
      ),

      division:
        cleanText(
          sectionData.division
        ) || null,

      title: cleanText(
        sectionData.title
      ),

      content: cleanText(
        sectionData.content
      ),

      evidence_classification:
        cleanText(
          sectionData.evidence_classification ||
          "interpretation"
        ),

      confidence_label:
        cleanText(
          sectionData.confidence_label ||
          "unresolved"
        ),

      position: Number(
        sectionData.position || 0
      ),

      updated_at:
        new Date().toISOString()
    };

    let result;

    if (sectionData.id) {
      result = await client
        .from(TABLES.sections)
        .update(payload)
        .eq("id", sectionData.id)
        .select()
        .single();
    } else {
      result = await client
        .from(TABLES.sections)
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    await addTimeline(
      reportId,
      "section_saved",
      payload.title
    );

    return result.data;
  }

  async function deleteSection(sectionId) {
    requireValue(
      sectionId,
      "SECTION ID"
    );

    await requireResearchAdmin();

    const client = getClient();

    const {
      data: existing,
      error: readError
    } = await client
      .from(TABLES.sections)
      .select("report_id,title")
      .eq("id", sectionId)
      .single();

    if (readError) {
      throw readError;
    }

    const { error } = await client
      .from(TABLES.sections)
      .delete()
      .eq("id", sectionId);

    if (error) {
      throw error;
    }

    await addTimeline(
      existing.report_id,
      "section_deleted",
      existing.title
    );

    return true;
  }

  // ----------------------------------------------------------
  // EVIDENCE
  // ----------------------------------------------------------

  async function getEvidence(reportId) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    const { data, error } = await getClient()
      .from(TABLES.evidence)
      .select("*")
      .eq("report_id", reportId)
      .order("position", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function addEvidence(
    reportId,
    evidenceData
  ) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    requireObject(
      evidenceData,
      "EVIDENCE DATA"
    );

    requireValue(
      evidenceData.title,
      "EVIDENCE TITLE"
    );

    await requireResearchAdmin();

    const payload = {
      report_id: reportId,

      evidence_type: cleanText(
        evidenceData.evidence_type ||
        "secondary_source"
      ),

      title: cleanText(
        evidenceData.title
      ),

      excerpt: cleanText(
        evidenceData.excerpt
      ),

      finding: cleanText(
        evidenceData.finding
      ),

      source_label: cleanText(
        evidenceData.source_label
      ),

      source_url:
        cleanText(
          evidenceData.source_url
        ) || null,

      classification: cleanText(
        evidenceData.classification ||
        "unverified"
      ),

      reliability: cleanText(
        evidenceData.reliability ||
        "moderate"
      ),

      position: Number(
        evidenceData.position || 0
      )
    };

    const { data, error } = await getClient()
      .from(TABLES.evidence)
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await addTimeline(
      reportId,
      "evidence_added",
      payload.title
    );

    return data;
  }

  async function deleteEvidence(evidenceId) {
    requireValue(
      evidenceId,
      "EVIDENCE ID"
    );

    await requireResearchAdmin();

    const client = getClient();

    const {
      data: existing,
      error: readError
    } = await client
      .from(TABLES.evidence)
      .select("report_id,title")
      .eq("id", evidenceId)
      .single();

    if (readError) {
      throw readError;
    }

    const { error } = await client
      .from(TABLES.evidence)
      .delete()
      .eq("id", evidenceId);

    if (error) {
      throw error;
    }

    await addTimeline(
      existing.report_id,
      "evidence_deleted",
      existing.title
    );

    return true;
  }

  // ----------------------------------------------------------
  // SOURCES
  // ----------------------------------------------------------

  async function getSources(reportId) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    const { data, error } = await getClient()
      .from(TABLES.sources)
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function addSource(
    reportId,
    sourceData
  ) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    requireObject(
      sourceData,
      "SOURCE DATA"
    );

    requireValue(
      sourceData.title,
      "SOURCE TITLE"
    );

    await requireResearchAdmin();

    const payload = {
      report_id: reportId,

      source_type: cleanText(
        sourceData.source_type ||
        "secondary"
      ),

      title: cleanText(
        sourceData.title
      ),

      author: cleanText(
        sourceData.author
      ),

      publication: cleanText(
        sourceData.publication
      ),

      source_date:
        cleanText(
          sourceData.source_date
        ) || null,

      url:
        cleanText(
          sourceData.url
        ) || null,

      citation_text: cleanText(
        sourceData.citation_text
      ),

      notes: cleanText(
        sourceData.notes
      ),

      verification_status:
        cleanText(
          sourceData.verification_status ||
          "unverified"
        )
    };

    const { data, error } = await getClient()
      .from(TABLES.sources)
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await addTimeline(
      reportId,
      "source_added",
      payload.title
    );

    return data;
  }

  async function deleteSource(sourceId) {
    requireValue(
      sourceId,
      "SOURCE ID"
    );

    await requireResearchAdmin();

    const client = getClient();

    const {
      data: existing,
      error: readError
    } = await client
      .from(TABLES.sources)
      .select("report_id,title")
      .eq("id", sourceId)
      .single();

    if (readError) {
      throw readError;
    }

    const { error } = await client
      .from(TABLES.sources)
      .delete()
      .eq("id", sourceId);

    if (error) {
      throw error;
    }

    await addTimeline(
      existing.report_id,
      "source_deleted",
      existing.title
    );

    return true;
  }

  // ----------------------------------------------------------
  // CONNECTIONS
  // ----------------------------------------------------------

  async function getConnections(reportId) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    const { data, error } = await getClient()
      .from(TABLES.connections)
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function addConnection(
    reportId,
    connectionData
  ) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    requireObject(
      connectionData,
      "CONNECTION DATA"
    );

    requireValue(
      connectionData.connected_label,
      "CONNECTED FILE LABEL"
    );

    await requireResearchAdmin();

    const payload = {
      report_id: reportId,

      connected_report_id:
        cleanText(
          connectionData.connected_report_id
        ) || null,

      connected_label: cleanText(
        connectionData.connected_label
      ),

      connection_type: cleanText(
        connectionData.connection_type ||
        "related"
      ),

      rationale: cleanText(
        connectionData.rationale
      ),

      confidence_label: cleanText(
        connectionData.confidence_label ||
        "provisional"
      )
    };

    const { data, error } = await getClient()
      .from(TABLES.connections)
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await addTimeline(
      reportId,
      "connection_added",
      payload.connected_label
    );

    return data;
  }

  async function deleteConnection(
    connectionId
  ) {
    requireValue(
      connectionId,
      "CONNECTION ID"
    );

    await requireResearchAdmin();

    const client = getClient();

    const {
      data: existing,
      error: readError
    } = await client
      .from(TABLES.connections)
      .select(
        "report_id,connected_label"
      )
      .eq("id", connectionId)
      .single();

    if (readError) {
      throw readError;
    }

    const { error } = await client
      .from(TABLES.connections)
      .delete()
      .eq("id", connectionId);

    if (error) {
      throw error;
    }

    await addTimeline(
      existing.report_id,
      "connection_deleted",
      existing.connected_label
    );

    return true;
  }

  // ----------------------------------------------------------
  // TIMELINE
  // ----------------------------------------------------------

  async function getTimeline(reportId) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    const { data, error } = await getClient()
      .from(TABLES.timeline)
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function addTimeline(
    reportId,
    eventType,
    detail
  ) {
    requireValue(
      reportId,
      "REPORT ID"
    );

    requireValue(
      eventType,
      "EVENT TYPE"
    );

    const { data, error } = await getClient()
      .from(TABLES.timeline)
      .insert({
        report_id: reportId,
        event_type: cleanText(eventType),
        detail: cleanText(detail)
      })
      .select()
      .single();

    if (error) {
      console.warn(
        "Research timeline insert failed:",
        error.message
      );

      return null;
    }

    return data;
  }

  // ----------------------------------------------------------
  // COMPLETE REPORT BUNDLE
  // ----------------------------------------------------------

  async function getReportBundle(identifier) {
    const report =
      await getReport(identifier);

    const [
      sections,
      evidence,
      sources,
      connections,
      timeline
    ] = await Promise.all([
      getSections(report.id),
      getEvidence(report.id),
      getSources(report.id),
      getConnections(report.id),
      getTimeline(report.id)
    ]);

    return {
      report,
      sections,
      evidence,
      sources,
      connections,
      timeline
    };
  }

  // ----------------------------------------------------------
  // RESEARCH STATISTICS
  // ----------------------------------------------------------

  async function getResearchStats() {
    const reports =
      await getReports();

    const totals = {
      all: reports.length,
      draft: 0,
      active: 0,
      review: 0,
      published: 0,
      archived: 0
    };

    reports.forEach((report) => {
      const status =
        normalizeStatus(report.status);

      if (status in totals) {
        totals[status] += 1;
      }
    });

    return totals;
  }

  // ----------------------------------------------------------
  // PUBLIC API
  // ----------------------------------------------------------

  global.ResearchEngine =
    Object.freeze({
      TABLES,

      slugify,
      currentUser,
      isResearchAdmin,
      requireResearchAdmin,

      nextReportNumber,
      nextReportCode,

      getReports,
      listReports: getReports,

      getReport,
      getReportBundle,

      createReport,
      updateReport,
      saveReport,
      publishReport,
      archiveReport,

      getSections,
      listSections: getSections,
      saveSection,
      deleteSection,

      getEvidence,
      listEvidence: getEvidence,
      addEvidence,
      deleteEvidence,

      getSources,
      listSources: getSources,
      addSource,
      deleteSource,

      getConnections,
      listConnections: getConnections,
      addConnection,
      deleteConnection,

      getTimeline,
      listTimeline: getTimeline,
      addTimeline,

      getResearchStats
    });

})(window);
