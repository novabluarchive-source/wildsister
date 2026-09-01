// ============================================================
// WILD SISTER // SID
// ARCHIVE RESEARCH ENGINE
// Version 2.0
//
// PART 1
// Core setup + authentication + archive loading +
// New Investigation
// ============================================================

(function (global) {
  "use strict";

  // ==========================================================
  // TABLE REGISTRY
  // ==========================================================

  const TABLES = Object.freeze({
    admins: "archive_admins",
    reports: "archive_files",
    sections: "archive_sections",
    evidence: "archive_evidence",
    sources: "archive_sources",
    connections: "archive_connections",
    timeline: "archive_timeline"
  });


  // ==========================================================
  // SUPABASE CLIENT
  // ==========================================================

  function getClient() {

    const client =
      global.supabaseClient ||
      global.wildSisterSupabase;

    if (!client) {
      throw new Error(
        "SUPABASE CLIENT NOT LOADED"
      );
    }

    return client;
  }


  // ==========================================================
  // BASIC HELPERS
  // ==========================================================

  function cleanText(value) {

    return String(
      value ?? ""
    ).trim();

  }


  function requireValue(
    value,
    label
  ) {

    if (
      value === undefined ||
      value === null ||
      cleanText(value) === ""
    ) {

      throw new Error(
        (label || "VALUE") +
        " IS REQUIRED"
      );

    }

  }


  function requireObject(
    value,
    label
  ) {

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {

      throw new Error(
        (label || "DATA") +
        " IS REQUIRED"
      );

    }

  }


  function slugify(value) {

    return cleanText(value)
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(
        0,
        90
      );

  }


  function normalizeArray(value) {

    if (
      Array.isArray(value)
    ) {

      return value
        .map(
          item =>
            cleanText(item)
        )
        .filter(Boolean);

    }


    if (
      typeof value === "string"
    ) {

      return value
        .split(
          /[>,|]/
        )
        .map(
          item =>
            cleanText(item)
        )
        .filter(Boolean);

    }


    return [];

  }


  function normalizeJsonArray(value) {

    if (
      Array.isArray(value)
    ) {
      return value;
    }


    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return [];
    }


    return [value];

  }


  function normalizeScore(value) {

    const number =
      Number(
        value || 0
      );


    if (
      !Number.isFinite(number)
    ) {
      return 0;
    }


    return Math.max(
      0,
      Math.min(
        100,
        Math.round(number)
      )
    );

  }


  function isUuid(value) {

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      cleanText(value)
    );

  }


  // ==========================================================
  // STATUS TRANSLATION
  //
  // Dashboard language:
  // draft / active / review / published / archived
  //
  // archive_files language:
  // DRAFT / UNDER REVIEW / PUBLISHED / ARCHIVED
  // ==========================================================

  function normalizeStatus(value) {

    const raw =
      cleanText(
        value || "draft"
      ).toLowerCase();


    const aliases = {

      draft:
        "DRAFT",

      active:
        "UNDER REVIEW",

      review:
        "UNDER REVIEW",

      "under review":
        "UNDER REVIEW",

      published:
        "PUBLISHED",

      archived:
        "ARCHIVED"

    };


    return (
      aliases[raw] ||
      cleanText(
        value || "DRAFT"
      ).toUpperCase()
    );

  }


  function legacyStatus(value) {

    const raw =
      cleanText(value)
        .toLowerCase();


    if (
      raw === "published"
    ) {
      return "published";
    }


    if (
      raw === "archived"
    ) {
      return "archived";
    }


    if (
      raw === "under review" ||
      raw === "active"
    ) {
      return "active";
    }


    return "draft";

  }


  // ==========================================================
  // VISIBILITY / CLEARANCE
  // ==========================================================

  function normalizeClearance(value) {

    const raw =
      cleanText(
        value || "PRIVATE"
      ).toLowerCase();


    if (
      raw === "public"
    ) {
      return "PUBLIC ARCHIVE";
    }


    if (
      raw === "members" ||
      raw === "member"
    ) {
      return "MEMBERS";
    }


    if (
      raw === "private"
    ) {
      return "PRIVATE";
    }


    return cleanText(
      value || "PRIVATE"
    ).toUpperCase();

  }


  function legacyVisibility(row) {

    const publication =
      cleanText(
        row.publication_status
      ).toLowerCase();


    const clearance =
      cleanText(
        row.clearance
      ).toLowerCase();


    const classification =
      cleanText(
        row.classification
      ).toLowerCase();


    if (
      publication === "published" ||
      clearance.includes("public") ||
      classification === "public"
    ) {

      return "public";

    }


    if (
      clearance.includes("member")
    ) {

      return "members";

    }


    return "private";

  }


  // ==========================================================
  // CONFIDENCE
  // ==========================================================

  function confidenceFromRow(row) {

    const confidence =
      row &&
      row.confidence_summary;


    if (
      !confidence ||
      typeof confidence !== "object" ||
      Array.isArray(confidence)
    ) {

      return {

        label:
          "unresolved",

        score:
          0

      };

    }


    return {

      label:
        cleanText(
          confidence.label ||
          confidence.confidence_label ||
          "unresolved"
        ).toLowerCase(),

      score:
        normalizeScore(
          confidence.score ??
          confidence.confidence_score ??
          0
        )

    };

  }


  // ==========================================================
  // ARCHIVE → DASHBOARD TRANSLATOR
  //
  // This is what allows reports.html to continue using:
  //
  // report.report_code
  // report.title
  // report.research_question
  // report.status
  //
  // even though Supabase now stores:
  //
  // code
  // name
  // investigation_question
  // publication_status
  // ==========================================================

  function toLegacyReport(row) {

    if (!row) {
      return row;
    }


    const confidence =
      confidenceFromRow(row);


    return {

      ...row,


      // --------------------------------------
      // OLD DASHBOARD FIELD NAMES
      // --------------------------------------

      report_code:
        row.code,

      title:
        row.name,

      research_question:
        row.investigation_question ||
        "",

      summary:
        row.purpose ||
        row.body ||
        "",

      scope:
        row.current_scope ||
        "",


      lead_division:

        row.lead_analyst ||

        row.division_code ||

        row.division_name ||

        row.division ||

        "",


      supporting_divisions:

        Array.isArray(
          row.supporting_divisions
        )

          ? row.supporting_divisions

          : [],


      route_steps:
        [],


      status:
        legacyStatus(
          row.publication_status ||
          row.case_status
        ),


      visibility:
        legacyVisibility(row),


      confidence_label:
        confidence.label,


      confidence_score:
        confidence.score,


      current_finding:
        row.integration ||
        "",


      open_questions:
        row.unresolved_questions ||
        "",


      updated_at:
        row.last_updated ||
        row.created_at,


      published_at:

        cleanText(
          row.publication_status
        ).toLowerCase() ===
        "published"

          ? (
              row.approved_at ||
              row.last_updated ||
              null
            )

          : null

    };

  }


  // ==========================================================
  // AUTHENTICATION
  // ==========================================================

  async function currentUser() {

    const client =
      getClient();


    const {

      data: {
        user
      },

      error

    } =
      await client.auth.getUser();


    if (error) {
      throw error;
    }


    if (!user) {

      throw new Error(
        "SIGNED-IN USER REQUIRED"
      );

    }


    return user;

  }


  // ==========================================================
  // ARCHIVE ADMIN CLEARANCE
  // ==========================================================

  async function isResearchAdmin() {

    const user =
      await currentUser();


    const {

      data,
      error

    } =
      await getClient()

        .from(
          TABLES.admins
        )

        .select(
          "user_id"
        )

        .eq(
          "user_id",
          user.id
        )

        .maybeSingle();


    if (error) {
      throw error;
    }


    return Boolean(data);

  }


  async function requireResearchAdmin() {

    const allowed =
      await isResearchAdmin();


    if (!allowed) {

      throw new Error(
        "ARCHIVE ADMIN CLEARANCE REQUIRED"
      );

    }


    return true;

  }


  // ==========================================================
  // NEXT SID FILE NUMBER
  // ==========================================================

  async function nextReportNumber() {

    const {

      data,
      error

    } =
      await getClient()

        .from(
          TABLES.reports
        )

        .select(
          "code"
        )

        .order(
          "created_at",
          {
            ascending: false
          }
        )

        .limit(500);


    if (error) {
      throw error;
    }


    let highest = 0;


    (
      data || []
    ).forEach(
      row => {

        const match =
          cleanText(
            row.code
          ).match(
            /(?:RPT|SID|FILE)-(\d+)$/i
          );


        if (match) {

          highest =
            Math.max(
              highest,
              Number(
                match[1]
              )
            );

        }

      }
    );


    return (
      "SID-" +
      String(
        highest + 1
      ).padStart(
        3,
        "0"
      )
    );

  }


  // Compatibility alias.
  const nextReportCode =
    nextReportNumber;


  // ==========================================================
  // LOAD ALL INVESTIGATIONS
  // ==========================================================

  async function getReports(
    options = {}
  ) {

    let query =
      getClient()

        .from(
          TABLES.reports
        )

        .select("*")

        .order(
          "last_updated",
          {
            ascending: false
          }
        );


    // --------------------------------------
    // SEARCH
    // --------------------------------------

    if (
      options.search
    ) {

      const search =
        cleanText(
          options.search
        )
          .replace(
            /[%,()]/g,
            " "
          );


      if (search) {

        query =
          query.or(

            [

              `code.ilike.%${search}%`,

              `name.ilike.%${search}%`,

              `investigation_question.ilike.%${search}%`,

              `purpose.ilike.%${search}%`

            ].join(",")

          );

      }

    }


    // --------------------------------------
    // LEAD DIVISION
    // --------------------------------------

    if (
      options.leadDivision
    ) {

      const division =
        cleanText(
          options.leadDivision
        ).toUpperCase();


      query =
        query.or(

          [
            `lead_analyst.eq.${division}`,
            `division_code.eq.${division}`,
            `division.eq.${division}`
          ].join(",")

        );

    }


    // --------------------------------------
    // PUBLIC ARCHIVE ONLY
    // --------------------------------------

    if (
      options.publicOnly
    ) {

      query =
        query.eq(
          "publication_status",
          "published"
        );

    }


    const {

      data,
      error

    } =
      await query;


    if (error) {
      throw error;
    }


    let rows =
      (
        data || []
      ).map(
        toLegacyReport
      );


    // --------------------------------------
    // DASHBOARD STATUS FILTER
    // --------------------------------------

    if (
      options.status
    ) {

      const wanted =
        legacyStatus(
          options.status
        );


      rows =
        rows.filter(
          row =>
            row.status ===
            wanted
        );

    }


    // --------------------------------------
    // VISIBILITY FILTER
    // --------------------------------------

    if (
      options.visibility
    ) {

      const wanted =
        cleanText(
          options.visibility
        ).toLowerCase();


      rows =
        rows.filter(
          row =>
            row.visibility ===
            wanted
        );

    }


    return rows;

  }


  const listReports =
    getReports;


  // ==========================================================
  // LOAD ONE INVESTIGATION
  // ==========================================================

  async function getReport(
    identifier
  ) {

    requireValue(
      identifier,
      "ARCHIVE FILE IDENTIFIER"
    );


    const value =
      cleanText(
        identifier
      );


    let query =
      getClient()

        .from(
          TABLES.reports
        )

        .select("*");


    // --------------------------------------
    // UUID
    // --------------------------------------

    if (
      isUuid(value)
    ) {

      query =
        query.eq(
          "id",
          value
        );

    }


    // --------------------------------------
    // SID FILE CODE
    // --------------------------------------

    else if (
      /^(?:RPT|SID|FILE)-\d+$/i.test(
        value
      )
    ) {

      query =
        query.eq(
          "code",
          value.toUpperCase()
        );

    }


    // --------------------------------------
    // SLUG
    // --------------------------------------

    else {

      query =
        query.eq(
          "slug",
          value
        );

    }


    const {

      data,
      error

    } =
      await query.maybeSingle();


    if (error) {
      throw error;
    }


    if (!data) {

      throw new Error(
        "ARCHIVE FILE NOT FOUND"
      );

    }


    return toLegacyReport(
      data
    );

  }


  // ==========================================================
  // CREATE NEW INVESTIGATION
  // ==========================================================

  async function createReport(
    reportData
  ) {

    requireObject(
      reportData,
      "INVESTIGATION DATA"
    );


    const title =
      cleanText(
        reportData.title ||
        reportData.name
      );


    const question =
      cleanText(
        reportData.research_question ||
        reportData.investigation_question
      );


    requireValue(
      title,
      "INVESTIGATION TITLE"
    );


    requireValue(
      question,
      "INVESTIGATION QUESTION"
    );


    await requireResearchAdmin();


    // --------------------------------------
    // FILE CODE
    // --------------------------------------

    const code =

      cleanText(
        reportData.report_code ||
        reportData.code
      )

      ||

      await nextReportNumber();


    // --------------------------------------
    // LEAD DIVISION
    // --------------------------------------

    const division =

      cleanText(

        reportData.lead_division ||

        reportData.division_code ||

        reportData.division ||

        "LUX"

      ).toUpperCase();


    // --------------------------------------
    // CONFIDENCE
    // --------------------------------------

    const confidenceScore =
      normalizeScore(

        reportData.confidence_score ??

        reportData
          .confidence_summary
          ?.score ??

        0

      );


    const confidenceLabel =
      cleanText(

        reportData.confidence_label ||

        reportData
          .confidence_summary
          ?.label ||

        "unresolved"

      ).toLowerCase();


    // --------------------------------------
    // STATUS
    // --------------------------------------

    const caseStatus =
      normalizeStatus(

        reportData.status ||

        reportData.case_status ||

        "DRAFT"

      );


    const publicationStatus =

      caseStatus ===
      "PUBLISHED"

        ? "published"

        : "draft";


    // --------------------------------------
    // VISIBILITY
    // --------------------------------------

    const visibility =
      cleanText(
        reportData.visibility
      ).toLowerCase();


    const now =
      new Date()
        .toISOString();


    // ========================================================
    // ARCHIVE FILE PAYLOAD
    // ========================================================

    const payload = {

      code:
        code,


      name:
        title,


      division:
        division,


      division_code:
        division,


      division_name:

        cleanText(
          reportData.division_name
        )

        ||

        division,


      tags:
        normalizeArray(
          reportData.tags
        ),


      body:
        cleanText(

          reportData.body ||

          reportData.summary

        ),


      classification:

        visibility ===
        "public"

          ? "public"

          : cleanText(
              reportData.classification ||
              "private"
            ).toLowerCase(),


      slug:

        cleanText(
          reportData.slug
        )

        ||

        slugify(title)

        ||

        slugify(code),


      purpose:

        cleanText(

          reportData.purpose ||

          reportData.summary

        ),


      investigation_question:
        question,


      current_scope:

        cleanText(

          reportData.current_scope ||

          reportData.scope

        ),


      lead_analyst:

        cleanText(
          reportData.lead_analyst
        )

        ||

        division,


      supporting_divisions:

        normalizeJsonArray(
          reportData
            .supporting_divisions
        ),


      case_status:
        caseStatus,


      clearance:

        visibility ===
        "public"

          ? "PUBLIC ARCHIVE"

          : normalizeClearance(

              reportData.clearance ||

              visibility ||

              "PRIVATE"

            ),


      historical_context:

        cleanText(
          reportData.historical_context
        ),


      analyst_notes:

        cleanText(
          reportData.analyst_notes
        ),


      active_debate:

        cleanText(
          reportData.active_debate
        ),


      integration:

        cleanText(

          reportData.integration ||

          reportData.current_finding

        ),


      unresolved_questions:

        cleanText(

          reportData
            .unresolved_questions ||

          reportData
            .open_questions

        ),


      confidence_summary: {

        label:
          confidenceLabel,

        score:
          confidenceScore

      },


      publication_status:
        publicationStatus,


      last_updated:
        now

    };


    // ========================================================
    // INSERT INTO SUPABASE
    // ========================================================

    const {

      data,
      error

    } =
      await getClient()

        .from(
          TABLES.reports
        )

        .insert(
          payload
        )

        .select()

        .single();


    if (error) {
      throw error;
    }


    // ========================================================
    // TIMELINE
    //
    // addTimeline() is defined in Part 5.
    // Function declarations are hoisted, so this will work
    // after the entire engine is complete.
    // ========================================================

    await addTimeline(

      data.id,

      "file_created",

      data.name

    );


    // Return dashboard-compatible record.
    return toLegacyReport(
      data
    );

  }
  // ============================================================
// PART 2
// UPDATE / SAVE / PUBLISH / ARCHIVE INVESTIGATION
// ============================================================


// ==========================================================
// UPDATE INVESTIGATION
// ==========================================================

async function updateReport(
  reportId,
  updates
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );

  requireObject(
    updates,
    "INVESTIGATION UPDATES"
  );

  await requireResearchAdmin();

  const payload = {};


  // ========================================================
  // TITLE
  // ========================================================

  if (
    "title" in updates ||
    "name" in updates
  ) {

    const name =
      cleanText(
        updates.title ||
        updates.name
      );

    requireValue(
      name,
      "INVESTIGATION TITLE"
    );

    payload.name =
      name;

    payload.slug =
      cleanText(
        updates.slug
      )
      ||
      slugify(name);
  }

  else if (
    "slug" in updates
  ) {

    payload.slug =
      cleanText(
        updates.slug
      );
  }


  // ========================================================
  // INVESTIGATION QUESTION
  // ========================================================

  if (
    "research_question" in updates ||
    "investigation_question" in updates
  ) {

    const question =
      cleanText(
        updates.research_question ||
        updates.investigation_question
      );

    requireValue(
      question,
      "INVESTIGATION QUESTION"
    );

    payload.investigation_question =
      question;
  }


  // ========================================================
  // PURPOSE / SUMMARY
  // ========================================================

  if (
    "summary" in updates ||
    "purpose" in updates
  ) {

    payload.purpose =
      cleanText(
        updates.purpose ??
        updates.summary
      );
  }


  // ========================================================
  // BODY
  // ========================================================

  if (
    "body" in updates
  ) {

    payload.body =
      cleanText(
        updates.body
      );
  }


  // ========================================================
  // SCOPE
  // ========================================================

  if (
    "scope" in updates ||
    "current_scope" in updates
  ) {

    payload.current_scope =
      cleanText(
        updates.current_scope ??
        updates.scope
      );
  }


  // ========================================================
  // LEAD DIVISION
  // ========================================================

  if (
    "lead_division" in updates ||
    "division" in updates ||
    "division_code" in updates
  ) {

    const division =
      cleanText(
        updates.lead_division ||
        updates.division_code ||
        updates.division
      ).toUpperCase();

    if (division) {

      payload.division =
        division;

      payload.division_code =
        division;

      payload.division_name =
        cleanText(
          updates.division_name
        )
        ||
        division;

      payload.lead_analyst =
        cleanText(
          updates.lead_analyst
        )
        ||
        division;
    }
  }


  // ========================================================
  // SUPPORTING DIVISIONS
  // ========================================================

  if (
    "supporting_divisions" in updates
  ) {

    payload.supporting_divisions =
      normalizeJsonArray(
        updates.supporting_divisions
      );
  }


  // ========================================================
  // TAGS
  // ========================================================

  if (
    "tags" in updates
  ) {

    payload.tags =
      normalizeArray(
        updates.tags
      );
  }


  // ========================================================
  // CASE STATUS
  // ========================================================

  if (
    "status" in updates ||
    "case_status" in updates
  ) {

    const status =
      normalizeStatus(
        updates.status ||
        updates.case_status
      );

    payload.case_status =
      status;

    if (
      status === "PUBLISHED"
    ) {

      payload.publication_status =
        "published";
    }

    else if (
      status === "ARCHIVED"
    ) {

      payload.publication_status =
        "archived";
    }

    else {

      payload.publication_status =
        "draft";
    }
  }


  // ========================================================
  // DIRECT PUBLICATION STATUS
  // ========================================================

  if (
    "publication_status" in updates
  ) {

    payload.publication_status =
      cleanText(
        updates.publication_status
      ).toLowerCase();
  }


  // ========================================================
  // VISIBILITY / CLEARANCE
  // ========================================================

  if (
    "visibility" in updates ||
    "clearance" in updates
  ) {

    const visibility =
      cleanText(
        updates.visibility
      ).toLowerCase();

    if (
      visibility === "public"
    ) {

      payload.clearance =
        "PUBLIC ARCHIVE";

      payload.classification =
        "public";
    }

    else {

      payload.clearance =
        normalizeClearance(
          updates.clearance ||
          visibility ||
          "PRIVATE"
        );

      if (
        visibility === "private"
      ) {

        payload.classification =
          "private";
      }
    }
  }


  // ========================================================
  // CLASSIFICATION
  // ========================================================

  if (
    "classification" in updates
  ) {

    payload.classification =
      cleanText(
        updates.classification
      ).toLowerCase();
  }


  // ========================================================
  // HISTORICAL CONTEXT
  // ========================================================

  if (
    "historical_context" in updates
  ) {

    payload.historical_context =
      cleanText(
        updates.historical_context
      );
  }


  // ========================================================
  // ANALYST NOTES
  // ========================================================

  if (
    "analyst_notes" in updates
  ) {

    payload.analyst_notes =
      cleanText(
        updates.analyst_notes
      );
  }


  // ========================================================
  // ACTIVE DEBATE
  // ========================================================

  if (
    "active_debate" in updates
  ) {

    payload.active_debate =
      cleanText(
        updates.active_debate
      );
  }


  // ========================================================
  // CURRENT FINDING
  //
  // Dashboard: current_finding
  // Archive: integration
  // ========================================================

  if (
    "current_finding" in updates ||
    "integration" in updates
  ) {

    payload.integration =
      cleanText(
        updates.integration ??
        updates.current_finding
      );
  }


  // ========================================================
  // OPEN QUESTIONS
  //
  // Dashboard: open_questions
  // Archive: unresolved_questions
  // ========================================================

  if (
    "open_questions" in updates ||
    "unresolved_questions" in updates
  ) {

    payload.unresolved_questions =
      cleanText(
        updates.unresolved_questions ??
        updates.open_questions
      );
  }


  // ========================================================
  // NEXT EVIDENCE REQUIRED
  // ========================================================

  if (
    "next_evidence_required" in updates
  ) {

    payload.next_evidence_required =
      normalizeJsonArray(
        updates.next_evidence_required
      );
  }


  // ========================================================
  // CONFIDENCE
  // ========================================================

  if (
    "confidence_label" in updates ||
    "confidence_score" in updates ||
    "confidence_summary" in updates
  ) {

    const existingConfidence =
      (
        updates.confidence_summary &&
        typeof updates.confidence_summary === "object"
      )
        ? updates.confidence_summary
        : {};

    payload.confidence_summary = {

      label:
        cleanText(
          existingConfidence.label ||
          updates.confidence_label ||
          "unresolved"
        ).toLowerCase(),

      score:
        normalizeScore(
          existingConfidence.score ??
          updates.confidence_score ??
          0
        )
    };
  }


  // ========================================================
  // UPDATE TIMESTAMP
  // ========================================================

  payload.last_updated =
    new Date().toISOString();


  // ========================================================
  // SAVE TO SUPABASE
  // ========================================================

  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.reports
      )

      .update(
        payload
      )

      .eq(
        "id",
        reportId
      )

      .select()

      .single();


  if (error) {
    throw error;
  }


  // ========================================================
  // TIMELINE EVENT
  // ========================================================

  await addTimeline(
    reportId,
    "file_updated",
    data.name
  );


  return toLegacyReport(
    data
  );
}


// ==========================================================
// SAVE INVESTIGATION
//
// Automatically CREATE or UPDATE.
// Existing reports.html can continue calling:
// ResearchEngine.saveReport(...)
// ==========================================================

async function saveReport(
  reportData
) {

  requireObject(
    reportData,
    "INVESTIGATION DATA"
  );


  if (
    reportData.id
  ) {

    return updateReport(
      reportData.id,
      reportData
    );
  }


  return createReport(
    reportData
  );
}


// ==========================================================
// PUBLISH INVESTIGATION
// ==========================================================

async function publishReport(
  reportId
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  await requireResearchAdmin();


  const user =
    await currentUser();


  const now =
    new Date().toISOString();


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.reports
      )

      .update({

        case_status:
          "PUBLISHED",

        publication_status:
          "published",

        classification:
          "public",

        clearance:
          "PUBLIC ARCHIVE",

        approved_by:
          user.id,

        approved_at:
          now,

        publication_error:
          null,

        last_updated:
          now

      })

      .eq(
        "id",
        reportId
      )

      .select()

      .single();


  if (error) {
    throw error;
  }


  await addTimeline(
    reportId,
    "file_published",
    data.name
  );


  return toLegacyReport(
    data
  );
}


// ==========================================================
// ARCHIVE INVESTIGATION
// ==========================================================

async function archiveReport(
  reportId
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  await requireResearchAdmin();


  const now =
    new Date().toISOString();


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.reports
      )

      .update({

        case_status:
          "ARCHIVED",

        publication_status:
          "archived",

        last_updated:
          now

      })

      .eq(
        "id",
        reportId
      )

      .select()

      .single();


  if (error) {
    throw error;
  }


  await addTimeline(
    reportId,
    "file_archived",
    data.name
  );


  return toLegacyReport(
    data
  );
}
  // ============================================================
// PART 3
// DIVISION FINDINGS + EVIDENCE BOARD
// ============================================================


// ==========================================================
// LOAD DIVISION FINDINGS
// ==========================================================

async function getSections(
  reportId
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.sections
      )

      .select("*")

      .eq(
        "archive_file_id",
        reportId
      )

      .order(
        "position",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  return data || [];
}


const listSections =
  getSections;


// ==========================================================
// SAVE DIVISION FINDING
// ==========================================================

async function saveSection(
  reportId,
  sectionData
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
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


  const payload = {

    archive_file_id:
      reportId,


    section_type:
      cleanText(
        sectionData.section_type ||
        "finding"
      ),


    division:
      cleanText(
        sectionData.division
      )
      ||
      null,


    title:
      cleanText(
        sectionData.title
      ),


    content:
      cleanText(
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


    position:
      Number(
        sectionData.position ||
        0
      ),


    updated_at:
      new Date()
        .toISOString()

  };


  let result;


  // ========================================================
  // UPDATE EXISTING FINDING
  // ========================================================

  if (
    sectionData.id
  ) {

    result =
      await getClient()

        .from(
          TABLES.sections
        )

        .update(
          payload
        )

        .eq(
          "id",
          sectionData.id
        )

        .select()

        .single();

  }


  // ========================================================
  // CREATE NEW FINDING
  // ========================================================

  else {

    result =
      await getClient()

        .from(
          TABLES.sections
        )

        .insert(
          payload
        )

        .select()

        .single();

  }


  if (
    result.error
  ) {

    throw result.error;

  }


  await addTimeline(

    reportId,

    sectionData.id
      ? "section_updated"
      : "section_added",

    payload.title

  );


  return result.data;
}


// ==========================================================
// DELETE DIVISION FINDING
// ==========================================================

async function deleteSection(
  sectionId
) {

  requireValue(
    sectionId,
    "SECTION ID"
  );


  await requireResearchAdmin();


  const client =
    getClient();


  const {
    data: existing,
    error: readError
  } =
    await client

      .from(
        TABLES.sections
      )

      .select(
        "archive_file_id,title"
      )

      .eq(
        "id",
        sectionId
      )

      .single();


  if (
    readError
  ) {

    throw readError;

  }


  const {
    error
  } =
    await client

      .from(
        TABLES.sections
      )

      .delete()

      .eq(
        "id",
        sectionId
      );


  if (error) {
    throw error;
  }


  await addTimeline(

    existing.archive_file_id,

    "section_deleted",

    existing.title

  );


  return true;
}


// ==========================================================
// LOAD EVIDENCE
// ==========================================================

async function getEvidence(
  reportId
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.evidence
      )

      .select("*")

      .eq(
        "archive_file_id",
        reportId
      )

      .order(
        "position",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  return data || [];
}


const listEvidence =
  getEvidence;


// ==========================================================
// ADD EVIDENCE
// ==========================================================

async function addEvidence(
  reportId,
  evidenceData
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
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

    archive_file_id:
      reportId,


    evidence_type:
      cleanText(
        evidenceData.evidence_type ||
        "secondary_source"
      ),


    title:
      cleanText(
        evidenceData.title
      ),


    excerpt:
      cleanText(
        evidenceData.excerpt
      ),


    finding:
      cleanText(
        evidenceData.finding
      ),


    source_label:
      cleanText(
        evidenceData.source_label
      ),


    source_url:
      cleanText(
        evidenceData.source_url
      )
      ||
      null,


    classification:
      cleanText(
        evidenceData.classification ||
        "unverified"
      ),


    reliability:
      cleanText(
        evidenceData.reliability ||
        "moderate"
      ),


    position:
      Number(
        evidenceData.position ||
        0
      )

  };


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.evidence
      )

      .insert(
        payload
      )

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


// ==========================================================
// UPDATE EVIDENCE
// ==========================================================

async function updateEvidence(
  evidenceId,
  evidenceData
) {

  requireValue(
    evidenceId,
    "EVIDENCE ID"
  );


  requireObject(
    evidenceData,
    "EVIDENCE DATA"
  );


  await requireResearchAdmin();


  const payload = {};


  if (
    "evidence_type" in evidenceData
  ) {

    payload.evidence_type =
      cleanText(
        evidenceData.evidence_type
      );
  }


  if (
    "title" in evidenceData
  ) {

    requireValue(
      evidenceData.title,
      "EVIDENCE TITLE"
    );

    payload.title =
      cleanText(
        evidenceData.title
      );
  }


  if (
    "excerpt" in evidenceData
  ) {

    payload.excerpt =
      cleanText(
        evidenceData.excerpt
      );
  }


  if (
    "finding" in evidenceData
  ) {

    payload.finding =
      cleanText(
        evidenceData.finding
      );
  }


  if (
    "source_label" in evidenceData
  ) {

    payload.source_label =
      cleanText(
        evidenceData.source_label
      );
  }


  if (
    "source_url" in evidenceData
  ) {

    payload.source_url =
      cleanText(
        evidenceData.source_url
      )
      ||
      null;
  }


  if (
    "classification" in evidenceData
  ) {

    payload.classification =
      cleanText(
        evidenceData.classification
      );
  }


  if (
    "reliability" in evidenceData
  ) {

    payload.reliability =
      cleanText(
        evidenceData.reliability
      );
  }


  if (
    "position" in evidenceData
  ) {

    payload.position =
      Number(
        evidenceData.position ||
        0
      );
  }


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.evidence
      )

      .update(
        payload
      )

      .eq(
        "id",
        evidenceId
      )

      .select()

      .single();


  if (error) {
    throw error;
  }


  await addTimeline(

    data.archive_file_id,

    "evidence_updated",

    data.title

  );


  return data;
}


// ==========================================================
// DELETE EVIDENCE
// ==========================================================

async function deleteEvidence(
  evidenceId
) {

  requireValue(
    evidenceId,
    "EVIDENCE ID"
  );


  await requireResearchAdmin();


  const client =
    getClient();


  const {
    data: existing,
    error: readError
  } =
    await client

      .from(
        TABLES.evidence
      )

      .select(
        "archive_file_id,title"
      )

      .eq(
        "id",
        evidenceId
      )

      .single();


  if (
    readError
  ) {

    throw readError;

  }


  const {
    error
  } =
    await client

      .from(
        TABLES.evidence
      )

      .delete()

      .eq(
        "id",
        evidenceId
      );


  if (error) {
    throw error;
  }


  await addTimeline(

    existing.archive_file_id,

    "evidence_deleted",

    existing.title

  );


  return true;
}
  // ============================================================
// PART 4
// SOURCES + CONNECTIONS
// ============================================================


// ==========================================================
// LOAD SOURCES
// ==========================================================

async function getSources(
  reportId
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.sources
      )

      .select("*")

      .eq(
        "archive_file_id",
        reportId
      )

      .order(
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  return data || [];
}


const listSources =
  getSources;


// ==========================================================
// ADD SOURCE
// ==========================================================

async function addSource(
  reportId,
  sourceData
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
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

    archive_file_id:
      reportId,


    source_type:
      cleanText(
        sourceData.source_type ||
        "secondary"
      ),


    title:
      cleanText(
        sourceData.title
      ),


    author:
      cleanText(
        sourceData.author
      ),


    publication:
      cleanText(
        sourceData.publication
      ),


    source_date:
      cleanText(
        sourceData.source_date
      )
      ||
      null,


    url:
      cleanText(
        sourceData.url
      )
      ||
      null,


    citation_text:
      cleanText(
        sourceData.citation_text
      ),


    notes:
      cleanText(
        sourceData.notes
      ),


    verification_status:
      cleanText(
        sourceData.verification_status ||
        "unverified"
      )

  };


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.sources
      )

      .insert(
        payload
      )

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


// ==========================================================
// UPDATE SOURCE
// ==========================================================

async function updateSource(
  sourceId,
  sourceData
) {

  requireValue(
    sourceId,
    "SOURCE ID"
  );


  requireObject(
    sourceData,
    "SOURCE DATA"
  );


  await requireResearchAdmin();


  const payload = {};


  if (
    "source_type" in sourceData
  ) {

    payload.source_type =
      cleanText(
        sourceData.source_type
      );
  }


  if (
    "title" in sourceData
  ) {

    requireValue(
      sourceData.title,
      "SOURCE TITLE"
    );

    payload.title =
      cleanText(
        sourceData.title
      );
  }


  if (
    "author" in sourceData
  ) {

    payload.author =
      cleanText(
        sourceData.author
      );
  }


  if (
    "publication" in sourceData
  ) {

    payload.publication =
      cleanText(
        sourceData.publication
      );
  }


  if (
    "source_date" in sourceData
  ) {

    payload.source_date =
      cleanText(
        sourceData.source_date
      )
      ||
      null;
  }


  if (
    "url" in sourceData
  ) {

    payload.url =
      cleanText(
        sourceData.url
      )
      ||
      null;
  }


  if (
    "citation_text" in sourceData
  ) {

    payload.citation_text =
      cleanText(
        sourceData.citation_text
      );
  }


  if (
    "notes" in sourceData
  ) {

    payload.notes =
      cleanText(
        sourceData.notes
      );
  }


  if (
    "verification_status" in sourceData
  ) {

    payload.verification_status =
      cleanText(
        sourceData.verification_status
      );
  }


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.sources
      )

      .update(
        payload
      )

      .eq(
        "id",
        sourceId
      )

      .select()

      .single();


  if (error) {
    throw error;
  }


  await addTimeline(

    data.archive_file_id,

    "source_updated",

    data.title

  );


  return data;
}


// ==========================================================
// DELETE SOURCE
// ==========================================================

async function deleteSource(
  sourceId
) {

  requireValue(
    sourceId,
    "SOURCE ID"
  );


  await requireResearchAdmin();


  const client =
    getClient();


  const {
    data: existing,
    error: readError
  } =
    await client

      .from(
        TABLES.sources
      )

      .select(
        "archive_file_id,title"
      )

      .eq(
        "id",
        sourceId
      )

      .single();


  if (
    readError
  ) {

    throw readError;
  }


  const {
    error
  } =
    await client

      .from(
        TABLES.sources
      )

      .delete()

      .eq(
        "id",
        sourceId
      );


  if (error) {
    throw error;
  }


  await addTimeline(

    existing.archive_file_id,

    "source_deleted",

    existing.title

  );


  return true;
}


// ==========================================================
// LOAD CONNECTIONS
// ==========================================================

async function getConnections(
  reportId
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.connections
      )

      .select("*")

      .eq(
        "archive_file_id",
        reportId
      )

      .order(
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  // Maintain compatibility with the existing dashboard.
  return (
    data || []
  ).map(
    row => ({
      ...row,

      connected_report_id:
        row.connected_archive_id
    })
  );
}


const listConnections =
  getConnections;


// ==========================================================
// ADD CONNECTION
// ==========================================================

async function addConnection(
  reportId,
  connectionData
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
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


  const connectedArchiveId =
    cleanText(
      connectionData.connected_archive_id ||
      connectionData.connected_report_id
    )
    ||
    null;


  // Prevent a file from being linked to itself.
  if (
    connectedArchiveId &&
    connectedArchiveId === reportId
  ) {

    throw new Error(
      "AN ARCHIVE FILE CANNOT CONNECT TO ITSELF"
    );
  }


  const payload = {

    archive_file_id:
      reportId,


    connected_archive_id:
      connectedArchiveId,


    connected_label:
      cleanText(
        connectionData.connected_label
      ),


    connection_type:
      cleanText(
        connectionData.connection_type ||
        "related"
      ),


    rationale:
      cleanText(
        connectionData.rationale
      ),


    confidence_label:
      cleanText(
        connectionData.confidence_label ||
        "provisional"
      )

  };


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.connections
      )

      .insert(
        payload
      )

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


  return {

    ...data,

    connected_report_id:
      data.connected_archive_id

  };
}


// ==========================================================
// UPDATE CONNECTION
// ==========================================================

async function updateConnection(
  connectionId,
  connectionData
) {

  requireValue(
    connectionId,
    "CONNECTION ID"
  );


  requireObject(
    connectionData,
    "CONNECTION DATA"
  );


  await requireResearchAdmin();


  const payload = {};


  if (
    "connected_archive_id" in connectionData ||
    "connected_report_id" in connectionData
  ) {

    payload.connected_archive_id =
      cleanText(
        connectionData.connected_archive_id ||
        connectionData.connected_report_id
      )
      ||
      null;
  }


  if (
    "connected_label" in connectionData
  ) {

    requireValue(
      connectionData.connected_label,
      "CONNECTED FILE LABEL"
    );

    payload.connected_label =
      cleanText(
        connectionData.connected_label
      );
  }


  if (
    "connection_type" in connectionData
  ) {

    payload.connection_type =
      cleanText(
        connectionData.connection_type
      );
  }


  if (
    "rationale" in connectionData
  ) {

    payload.rationale =
      cleanText(
        connectionData.rationale
      );
  }


  if (
    "confidence_label" in connectionData
  ) {

    payload.confidence_label =
      cleanText(
        connectionData.confidence_label
      );
  }


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.connections
      )

      .update(
        payload
      )

      .eq(
        "id",
        connectionId
      )

      .select()

      .single();


  if (error) {
    throw error;
  }


  await addTimeline(

    data.archive_file_id,

    "connection_updated",

    data.connected_label

  );


  return {

    ...data,

    connected_report_id:
      data.connected_archive_id

  };
}


// ==========================================================
// DELETE CONNECTION
// ==========================================================

async function deleteConnection(
  connectionId
) {

  requireValue(
    connectionId,
    "CONNECTION ID"
  );


  await requireResearchAdmin();


  const client =
    getClient();


  const {
    data: existing,
    error: readError
  } =
    await client

      .from(
        TABLES.connections
      )

      .select(
        "archive_file_id,connected_label"
      )

      .eq(
        "id",
        connectionId
      )

      .single();


  if (
    readError
  ) {

    throw readError;
  }


  const {
    error
  } =
    await client

      .from(
        TABLES.connections
      )

      .delete()

      .eq(
        "id",
        connectionId
      );


  if (error) {
    throw error;
  }


  await addTimeline(

    existing.archive_file_id,

    "connection_deleted",

    existing.connected_label

  );


  return true;
}
  // ============================================================
// PART 5
// TIMELINE + COMPLETE BUNDLE + STATISTICS + PUBLIC API
// FINAL SECTION
// ============================================================


// ==========================================================
// LOAD TIMELINE
// ==========================================================

async function getTimeline(
  reportId
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.timeline
      )

      .select("*")

      .eq(
        "archive_file_id",
        reportId
      )

      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (error) {
    throw error;
  }


  return data || [];
}


const listTimeline =
  getTimeline;


// ==========================================================
// ADD TIMELINE EVENT
//
// Most timeline events are created automatically by:
// createReport()
// updateReport()
// addEvidence()
// addSource()
// addConnection()
// publishReport()
// etc.
// ==========================================================

async function addTimeline(
  reportId,
  eventType,
  detail
) {

  requireValue(
    reportId,
    "ARCHIVE FILE ID"
  );


  requireValue(
    eventType,
    "EVENT TYPE"
  );


  const payload = {

    archive_file_id:
      reportId,

    event_type:
      cleanText(
        eventType
      ),

    detail:
      cleanText(
        detail
      )

  };


  const {
    data,
    error
  } =
    await getClient()

      .from(
        TABLES.timeline
      )

      .insert(
        payload
      )

      .select()

      .single();


  // Timeline failure should not destroy the primary action.
  // Example:
  // Evidence can still save even if its timeline entry fails.
  if (error) {

    console.warn(
      "SID TIMELINE INSERT FAILED:",
      error.message
    );

    return null;
  }


  return data;
}


// ==========================================================
// COMPLETE INVESTIGATION BUNDLE
//
// Loads:
// file
// division findings
// evidence
// sources
// connections
// timeline
//
// This is what the workspace needs when a file is opened.
// ==========================================================

async function getReportBundle(
  identifier
) {

  const report =
    await getReport(
      identifier
    );


  const [

    sections,

    evidence,

    sources,

    connections,

    timeline

  ] =
    await Promise.all([

      getSections(
        report.id
      ),

      getEvidence(
        report.id
      ),

      getSources(
        report.id
      ),

      getConnections(
        report.id
      ),

      getTimeline(
        report.id
      )

    ]);


  return {

    report,

    // Archive-native alias
    file:
      report,

    sections,

    evidence,

    sources,

    connections,

    timeline

  };
}


// Existing dashboard compatibility.
const getBundle =
  getReportBundle;


// ==========================================================
// RESEARCH / ARCHIVE STATISTICS
// ==========================================================

async function getResearchStats() {

  const reports =
    await getReports();


  const totals = {

    all:
      reports.length,

    draft:
      0,

    active:
      0,

    review:
      0,

    published:
      0,

    archived:
      0

  };


  reports.forEach(
    report => {

      const status =
        report.status ||
        "draft";


      if (
        status in totals
      ) {

        totals[status] += 1;

      }

    }
  );


  return totals;
}


// ==========================================================
// ARCHIVE-NATIVE ALIASES
//
// The dashboard can continue using "Report" terminology,
// while new SID code can start using "Archive File."
// ==========================================================

const getArchiveFiles =
  getReports;


const getArchiveFile =
  getReport;


const createArchiveFile =
  createReport;


const updateArchiveFile =
  updateReport;


const saveArchiveFile =
  saveReport;


const publishArchiveFile =
  publishReport;


const archiveFile =
  archiveReport;


const getArchiveBundle =
  getReportBundle;


// ==========================================================
// PUBLIC RESEARCH ENGINE API
// ==========================================================

global.ResearchEngine =
  Object.freeze({

    // ------------------------------------------------------
    // TABLES
    // ------------------------------------------------------

    TABLES,


    // ------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------

    slugify,


    // ------------------------------------------------------
    // AUTH
    // ------------------------------------------------------

    currentUser,

    isResearchAdmin,

    requireResearchAdmin,


    // ------------------------------------------------------
    // NUMBERING
    // ------------------------------------------------------

    nextReportNumber,

    nextReportCode,


    // ------------------------------------------------------
    // INVESTIGATIONS
    // ------------------------------------------------------

    getReports,

    listReports,

    getReport,

    getReportBundle,

    getBundle,

    createReport,

    updateReport,

    saveReport,

    publishReport,

    archiveReport,


    // ------------------------------------------------------
    // DIVISION FINDINGS
    // ------------------------------------------------------

    getSections,

    listSections,

    saveSection,

    deleteSection,


    // ------------------------------------------------------
    // EVIDENCE
    // ------------------------------------------------------

    getEvidence,

    listEvidence,

    addEvidence,

    updateEvidence,

    deleteEvidence,


    // ------------------------------------------------------
    // SOURCES
    // ------------------------------------------------------

    getSources,

    listSources,

    addSource,

    updateSource,

    deleteSource,


    // ------------------------------------------------------
    // CONNECTIONS
    // ------------------------------------------------------

    getConnections,

    listConnections,

    addConnection,

    updateConnection,

    deleteConnection,


    // ------------------------------------------------------
    // TIMELINE
    // ------------------------------------------------------

    getTimeline,

    listTimeline,

    addTimeline,


    // ------------------------------------------------------
    // STATISTICS
    // ------------------------------------------------------

    getResearchStats,


    // ------------------------------------------------------
    // ARCHIVE-NATIVE API
    // ------------------------------------------------------

    getArchiveFiles,

    getArchiveFile,

    createArchiveFile,

    updateArchiveFile,

    saveArchiveFile,

    publishArchiveFile,

    archiveFile,

    getArchiveBundle

  });


// ==========================================================
// ENGINE READY
// ==========================================================

console.info(
  "SID ARCHIVE RESEARCH ENGINE v2.0 LOADED"
);


})(window);
