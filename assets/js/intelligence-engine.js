// SID // Phase 3A Intelligence Engine
// Manual workflow only. No model execution and no automatic publication.
(function (global) {
  "use strict";

  const TABLES = Object.freeze({
    plans: "archive_investigation_plans",
    assignments: "archive_analyst_assignments",
    returns: "archive_analyst_returns",
    claims: "archive_claims",
    support: "archive_claim_support",
    nix: "archive_nix_reviews",
    review: "archive_review_queue",
    runs: "archive_analyst_runs",
    timeline: "archive_timeline"
  });

  const REVIEW_ACTIONS = Object.freeze({
    "ACCEPT FINDING": "ACCEPTED",
    "EDIT FINDING": "PENDING",
    "REJECT FINDING": "REJECTED",
    "REQUEST MORE RESEARCH": "MORE RESEARCH",
    "RETURN TO ANALYST": "RETURNED",
    "MARK UNRESOLVED": "UNRESOLVED"
  });

  function client() {
    const value = global.supabaseClient || global.wildSisterSupabase;
    if (!value) throw new Error("SUPABASE CLIENT NOT LOADED");
    return value;
  }

  function text(value) { return String(value ?? "").trim(); }
  function list(value) {
    if (Array.isArray(value)) return value;
    return text(value).split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
  }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function required(value, label) { if (!text(value)) throw new Error(`${label} IS REQUIRED`); }
  async function admin() { return global.ResearchEngine.requireResearchAdmin(); }

  async function one(query) {
    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  }

  async function log(fileId, eventType, detail, metadata) {
    const user = await global.ResearchEngine.currentUser();
    const { data, error } = await client().from(TABLES.timeline).insert({
      archive_file_id: fileId,
      event_type: text(eventType),
      detail: text(detail),
      metadata: object(metadata),
      actor_id: user.id
    }).select("*").single();
    if (error) throw error;
    return data;
  }

  async function getBundle(fileId) {
    required(fileId, "ARCHIVE FILE ID");
    await admin();
    const [plans, assignments, returns, claims, support, nixReviews, reviewQueue, runs] = await Promise.all([
      client().from(TABLES.plans).select("*").eq("archive_file_id", fileId).order("created_at"),
      client().from(TABLES.assignments).select("*").eq("archive_file_id", fileId).order("priority").order("created_at"),
      client().from(TABLES.returns).select("*").eq("archive_file_id", fileId).order("created_at"),
      client().from(TABLES.claims).select("*").eq("archive_file_id", fileId).order("created_at"),
      client().from(TABLES.support).select("*").eq("archive_file_id", fileId).order("created_at"),
      client().from(TABLES.nix).select("*").eq("archive_file_id", fileId).order("created_at", { ascending: false }),
      client().from(TABLES.review).select("*").eq("archive_file_id", fileId).order("created_at", { ascending: false }),
      client().from(TABLES.runs).select("*").eq("archive_file_id", fileId).order("created_at", { ascending: false })
    ]);
    const result = [plans, assignments, returns, claims, support, nixReviews, reviewQueue, runs];
    const failed = result.find(entry => entry.error);
    if (failed) throw failed.error;
    return {
      plan: plans.data?.[0] || null,
      assignments: assignments.data || [],
      returns: returns.data || [],
      claims: claims.data || [],
      support: support.data || [],
      nixReviews: nixReviews.data || [],
      reviewQueue: reviewQueue.data || [],
      runs: runs.data || []
    };
  }

  async function savePlan(fileId, values) {
    await admin();
    required(fileId, "ARCHIVE FILE ID");
    const payload = {
      archive_file_id: fileId,
      question_type: text(values.question_type) || "OPEN RESEARCH",
      proposed_divisions: Array.isArray(values.proposed_divisions) ? values.proposed_divisions : [],
      required_evidence: list(values.required_evidence),
      known_gaps: list(values.known_gaps),
      research_questions: list(values.research_questions),
      dependencies: list(values.dependencies),
      recommended_order: list(values.recommended_order),
      stop_conditions: list(values.stop_conditions),
      status: text(values.status || "DRAFT").toUpperCase()
    };
    const row = await one(client().from(TABLES.plans).upsert(payload, { onConflict: "archive_file_id" }).select("*"));
    await log(fileId, "investigation_plan_created", row.question_type, { plan_id: row.id, status: row.status });
    return row;
  }

  async function createAssignment(fileId, values) {
    await admin();
    const analyst = text(values.analyst).toUpperCase();
    const registry = global.SIDAnalystRegistry.get(analyst);
    if (!registry) throw new Error("OFFICIAL ANALYST IS REQUIRED");
    required(values.plan_id, "INVESTIGATION PLAN");
    required(values.question, "ASSIGNMENT QUESTION");
    const row = await one(client().from(TABLES.assignments).insert({
      archive_file_id: fileId,
      plan_id: values.plan_id,
      analyst,
      division: registry.division,
      question: text(values.question),
      objective: text(values.objective),
      required_inputs: list(values.required_inputs),
      dependencies: list(values.dependencies),
      status: text(values.status || "QUEUED").toUpperCase(),
      priority: Math.max(0, Math.min(100, Number(values.priority || 50)))
    }).select("*"));
    await log(fileId, "analyst_assigned", `${analyst} // ${row.question}`, { assignment_id: row.id, analyst });
    return row;
  }

  async function updateAssignment(id, updates) {
    await admin();
    const current = await one(client().from(TABLES.assignments).select("*").eq("id", id));
    const payload = { ...updates };
    if (payload.status) payload.status = text(payload.status).toUpperCase();
    const now = new Date().toISOString();
    if (payload.status === "IN PROGRESS" && !current.started_at) payload.started_at = now;
    if (payload.status === "COMPLETE") payload.completed_at = now;
    const row = await one(client().from(TABLES.assignments).update(payload).eq("id", id).select("*"));
    const event = row.status === "IN PROGRESS" ? "analyst_started" : row.status === "COMPLETE" ? "analyst_completed" : "analyst_assignment_updated";
    await log(row.archive_file_id, event, `${row.analyst} // ${row.status}`, { assignment_id: row.id });
    return row;
  }

  async function saveReturn(fileId, values) {
    await admin();
    required(values.assignment_id, "ASSIGNMENT");
    required(values.summary, "SUMMARY");
    const assignment = await one(client().from(TABLES.assignments).select("*").eq("id", values.assignment_id));
    if (assignment.archive_file_id !== fileId) throw new Error("ASSIGNMENT DOES NOT BELONG TO THIS FILE");
    const payload = {
      archive_file_id: fileId,
      assignment_id: assignment.id,
      analyst: assignment.analyst,
      division: assignment.division,
      assignment_question: assignment.question,
      summary: text(values.summary),
      calculations: list(values.calculations).map(expression => ({ expression, verified: false })),
      interpretations: list(values.interpretations),
      contradictions: list(values.contradictions),
      limitations: list(values.limitations),
      open_questions: list(values.open_questions),
      confidence: text(values.confidence || "UNRESOLVED").toUpperCase(),
      recommended_next_step: text(values.recommended_next_step),
      status: text(values.status || "SUBMITTED").toUpperCase()
    };
    const row = await one(client().from(TABLES.returns).upsert(payload, { onConflict: "assignment_id" }).select("*"));
    await updateAssignment(assignment.id, { status: "COMPLETE" });
    await ensureReview(fileId, "ANALYST RETURN", { analyst_return_id: row.id });
    return row;
  }

  async function createClaim(fileId, values) {
    await admin();
    required(values.claim_text, "CLAIM");
    const row = await one(client().from(TABLES.claims).insert({
      archive_file_id: fileId,
      originating_return_id: values.originating_return_id || null,
      claim_text: text(values.claim_text),
      claim_kind: text(values.claim_kind || "CLAIM").toUpperCase(),
      significance: text(values.significance || "STANDARD").toUpperCase(),
      status: "UNRESOLVED",
      rule_003_applies: values.rule_003_applies === true || values.rule_003_applies === "true"
    }).select("*"));
    await log(fileId, "claim_created", row.claim_text, { claim_id: row.id, rule_003_applies: row.rule_003_applies });
    await ensureReview(fileId, "CLAIM", { claim_id: row.id });
    return row;
  }

  function evaluateSupportRows(claim, rows) {
    const qualifying = rows.filter(row => row.stance === "SUPPORTS" && row.independence_status === "INDEPENDENT" && ["CHECKED", "VERIFIED"].includes(row.verification_status) && text(row.lineage_key));
    const independentLineages = [...new Set(qualifying.map(row => row.lineage_key))];
    const derivative = rows.filter(row => ["DERIVATIVE", "SHARED SOURCE"].includes(row.independence_status));
    const contradictions = rows.filter(row => row.stance === "CONTRADICTS" || row.verification_status === "DISPUTED");
    const rejected = rows.filter(row => row.stance === "REJECTS" || row.verification_status === "REJECTED");
    let status = "UNRESOLVED";
    if (rejected.length) status = "REJECTED";
    else if (contradictions.length) status = "CONTRADICTED";
    else if (independentLineages.length >= 2) status = "SUPPORTED MULTIPLE TIMES";
    else if (independentLineages.length === 1) status = "SUPPORTED ONCE";
    const rule003Satisfied = !claim.rule_003_applies || independentLineages.length >= 2;
    return { status, independentLineages, independentCount: independentLineages.length, derivativeCount: derivative.length, contradictions, rejected, rule003Satisfied };
  }

  async function evaluateClaim(claimId, persist) {
    await admin();
    const claim = await one(client().from(TABLES.claims).select("*").eq("id", claimId));
    const { data, error } = await client().from(TABLES.support).select("*").eq("claim_id", claimId);
    if (error) throw error;
    const evaluation = evaluateSupportRows(claim, data || []);
    if (persist !== false && claim.status !== evaluation.status) {
      await client().from(TABLES.claims).update({ status: evaluation.status }).eq("id", claimId);
    }
    return { claim, support: data || [], ...evaluation };
  }

  async function addClaimSupport(fileId, values) {
    await admin();
    required(values.claim_id, "CLAIM");
    required(values.originating_analyst, "ORIGINATING ANALYST");
    const independence = text(values.independence_status || "UNKNOWN").toUpperCase();
    const lineageKey = text(values.lineage_key) || null;
    if (["INDEPENDENT", "DERIVATIVE", "SHARED SOURCE"].includes(independence) && !lineageKey) throw new Error("LINEAGE KEY IS REQUIRED");
    const row = await one(client().from(TABLES.support).insert({
      archive_file_id: fileId,
      claim_id: values.claim_id,
      analyst_return_id: values.analyst_return_id || null,
      evidence_id: values.evidence_id || null,
      source_id: values.source_id || null,
      originating_analyst: text(values.originating_analyst).toUpperCase(),
      stance: text(values.stance || "SUPPORTS").toUpperCase(),
      support_type: text(values.support_type || "OTHER").toUpperCase(),
      independence_status: independence,
      verification_status: text(values.verification_status || "UNVERIFIED").toUpperCase(),
      lineage_key: lineageKey,
      derived_from_support_id: values.derived_from_support_id || null,
      notes: text(values.notes)
    }).select("*"));
    const evaluation = await evaluateClaim(values.claim_id, true);
    const event = row.stance === "CONTRADICTS" ? "claim_contradicted" : row.stance === "REJECTS" ? "claim_rejected" : "claim_supported";
    await log(fileId, event, `${row.originating_analyst} // ${row.lineage_key || "UNKNOWN LINEAGE"}`, { claim_id: row.claim_id, support_id: row.id, lineage_key: row.lineage_key, independent_lineages: evaluation.independentCount });
    return { row, evaluation };
  }

  async function runAnalyst(fileId, assignmentId) {
    await admin();
    const assignment = await one(client().from(TABLES.assignments).select("*").eq("id", assignmentId));
    if (assignment.archive_file_id !== fileId) throw new Error("ASSIGNMENT DOES NOT BELONG TO THIS FILE");
    const { data: { session } } = await client().auth.getSession();
    if (!session) throw new Error("AUTHENTICATION REQUIRED");
    const key = global.crypto?.randomUUID?.() || `${assignmentId}-${Date.now()}`;
    const response = await fetch("/api/analyst-run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "Idempotency-Key": key },
      body: JSON.stringify({ archive_file_id: fileId, assignment_id: assignmentId, analyst: assignment.analyst })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || `ANALYST RUN FAILED (${response.status})`);
    return payload;
  }

  async function createProposedClaim(runId, index, edits) {
    await admin();
    const run = await one(client().from(TABLES.runs).select("*").eq("id", runId));
    const proposals = [...(run.proposed_claims || [])];
    const proposal = proposals[index];
    if (!proposal) throw new Error("PROPOSED CLAIM NOT FOUND");
    if (proposal.created_claim_id) throw new Error("PROPOSED CLAIM ALREADY CREATED");
    const claim = await createClaim(run.archive_file_id, {
      originating_return_id: run.analyst_return_id,
      claim_text: edits?.claim_text || proposal.claim_text,
      claim_kind: edits?.claim_kind || proposal.claim_kind || "CLAIM",
      significance: edits?.significance || proposal.significance || "STANDARD",
      rule_003_applies: edits?.rule_003_applies ?? proposal.rule_003_suggested === true
    });
    proposals[index] = { ...proposal, created_claim_id: claim.id, operator_status: "CREATED" };
    await one(client().from(TABLES.runs).update({ proposed_claims: proposals }).eq("id", runId).select("*"));
    await log(run.archive_file_id, "PROPOSED CLAIM CREATED", claim.claim_text, { run_id: runId, claim_id: claim.id });
    return claim;
  }

  async function discardProposedClaim(runId, index) {
    await admin();
    const run = await one(client().from(TABLES.runs).select("*").eq("id", runId));
    const proposals = [...(run.proposed_claims || [])];
    if (!proposals[index]) throw new Error("PROPOSED CLAIM NOT FOUND");
    proposals[index] = { ...proposals[index], operator_status: "DISCARDED" };
    return one(client().from(TABLES.runs).update({ proposed_claims: proposals }).eq("id", runId).select("*"));
  }

  async function approveProposedSupport(runId, index) {
    await admin();
    const run = await one(client().from(TABLES.runs).select("*").eq("id", runId));
    const suggestions = [...(run.proposed_support || [])];
    const suggestion = suggestions[index];
    if (!suggestion) throw new Error("PROPOSED SUPPORT NOT FOUND");
    if (suggestion.operator_status === "APPROVED") throw new Error("SUPPORT ALREADY APPROVED");
    const proposal = (run.proposed_claims || [])[suggestion.claim_index];
    if (!proposal?.created_claim_id) throw new Error("CREATE THE PROPOSED CLAIM BEFORE ATTACHING SUPPORT");
    const result = await addClaimSupport(run.archive_file_id, {
      claim_id: proposal.created_claim_id, analyst_return_id: run.analyst_return_id,
      evidence_id: suggestion.evidence_id, source_id: suggestion.source_id,
      originating_analyst: run.analyst, stance: "SUPPORTS", support_type: suggestion.source_id ? "SOURCE" : "EVIDENCE",
      independence_status: "INDEPENDENT", verification_status: "UNVERIFIED", lineage_key: suggestion.lineage_key,
      notes: "Operator-approved support suggested by validated analyst return. Verification remains required."
    });
    suggestions[index] = { ...suggestion, operator_status: "APPROVED", support_id: result.row.id };
    await one(client().from(TABLES.runs).update({ proposed_support: suggestions }).eq("id", runId).select("*"));
    await log(run.archive_file_id, "SUPPORT APPROVED", suggestion.lineage_key, { run_id: runId, support_id: result.row.id });
    return result;
  }

  async function createNixReview(fileId, values) {
    await admin();
    const row = await one(client().from(TABLES.nix).insert({
      archive_file_id: fileId,
      status: text(values.status || "COMPLETE").toUpperCase(),
      verdict: text(values.verdict || "INSUFFICIENT EVIDENCE").toUpperCase(),
      systems_reviewed: list(values.systems_reviewed),
      agreements: list(values.agreements),
      contradictions: list(values.contradictions),
      unresolved_links: list(values.unresolved_links),
      rejected_connections: list(values.rejected_connections),
      claim_assessments: Array.isArray(values.claim_assessments) ? values.claim_assessments : [],
      overall_convergence: text(values.overall_convergence),
      suggested_confidence: text(values.suggested_confidence || "UNRESOLVED").toUpperCase(),
      confidence_factors: object(values.confidence_factors),
      reviewed_by: (await global.ResearchEngine.currentUser()).id,
      completed_at: new Date().toISOString()
    }).select("*"));
    await log(fileId, "nix_review_completed", row.verdict, { nix_review_id: row.id });
    await ensureReview(fileId, "NIX REVIEW", { nix_review_id: row.id });
    return row;
  }

  async function ensureReview(fileId, reviewType, target) {
    const key = target.analyst_return_id ? "analyst_return_id" : target.claim_id ? "claim_id" : "nix_review_id";
    const { data, error } = await client().from(TABLES.review).select("*").eq(key, target[key]).maybeSingle();
    if (error) throw error;
    if (data) return data;
    return one(client().from(TABLES.review).insert({ archive_file_id: fileId, review_type: reviewType, ...target }).select("*"));
  }

  async function reviewItem(reviewId, action, notes) {
    await admin();
    const normalized = text(action).toUpperCase();
    const status = REVIEW_ACTIONS[normalized];
    if (!status) throw new Error("INVALID OPERATOR ACTION");
    const user = await global.ResearchEngine.currentUser();
    const row = await one(client().from(TABLES.review).update({
      status,
      operator_action: normalized,
      operator_notes: text(notes),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      eligible_for_promotion: false
    }).eq("id", reviewId).select("*"));
    await log(row.archive_file_id, normalized === "ACCEPT FINDING" ? "operator_accepted" : normalized === "REJECT FINDING" ? "operator_rejected" : normalized === "REQUEST MORE RESEARCH" ? "more_research_requested" : "operator_reviewed", normalized, { review_id: row.id });
    if (row.nix_review_id && status === "ACCEPTED") await acceptNixProjection(row.nix_review_id);
    return row;
  }

  async function acceptNixProjection(nixReviewId) {
    const review = await one(client().from(TABLES.nix).select("*").eq("id", nixReviewId));
    const payload = {
      systems_reviewed: review.systems_reviewed.join(", "),
      agreements: review.agreements.join("\n"),
      contradictions: review.contradictions.join("\n"),
      unresolved_links: review.unresolved_links.join("\n"),
      rejected_connections: review.rejected_connections.join("\n"),
      overall_convergence: review.overall_convergence,
      confidence: review.suggested_confidence.toLowerCase(),
      verdict: review.verdict.toLowerCase().replaceAll(" ", "_"),
      reviewed_at: review.completed_at,
      reviewed_by: review.reviewed_by
    };
    await global.ResearchEngine.updateReport(review.archive_file_id, { nix_review: payload });
    await client().from(TABLES.nix).update({ status: "ACCEPTED" }).eq("id", nixReviewId);
  }

  async function setPromotionEligibility(reviewId, eligible) {
    await admin();
    const existing = await one(client().from(TABLES.review).select("*").eq("id", reviewId));
    if (existing.status !== "ACCEPTED") throw new Error("ONLY ACCEPTED INTELLIGENCE CAN BECOME ELIGIBLE");
    return one(client().from(TABLES.review).update({ eligible_for_promotion: Boolean(eligible) }).eq("id", reviewId).select("*"));
  }

  async function promoteReview(reviewId, values) {
    await admin();
    const review = await one(client().from(TABLES.review).select("*").eq("id", reviewId));
    if (review.status !== "ACCEPTED" || !review.eligible_for_promotion) throw new Error("REVIEW MUST BE ACCEPTED AND ELIGIBLE BEFORE PROMOTION");
    if (review.promoted_section_id) throw new Error("INTELLIGENCE HAS ALREADY BEEN PROMOTED");
    let title = text(values?.title), content = text(values?.content), division = text(values?.division || "NIX");
    if (review.claim_id) {
      const claim = await one(client().from(TABLES.claims).select("*").eq("id", review.claim_id));
      title ||= claim.claim_kind;
      content ||= claim.claim_text;
    } else if (review.analyst_return_id) {
      const result = await one(client().from(TABLES.returns).select("*").eq("id", review.analyst_return_id));
      title ||= `${result.analyst} INTELLIGENCE RETURN`;
      content ||= result.summary;
      division = result.analyst;
    } else {
      throw new Error("NIX REVIEWS ARE ACCEPTED AS A PROJECTION, NOT PROMOTED AS FINDINGS");
    }
    const section = await global.ResearchEngine.saveSection(review.archive_file_id, {
      title, content, division,
      section_type: "finding",
      evidence_classification: "interpretation",
      confidence_label: "unresolved"
    });
    const row = await one(client().from(TABLES.review).update({ promoted_section_id: section.id, promoted_at: new Date().toISOString() }).eq("id", reviewId).select("*"));
    await log(review.archive_file_id, "finding_promoted", title, { review_id: row.id, section_id: section.id });
    return { review: row, section };
  }

  global.IntelligenceEngine = Object.freeze({
    TABLES, getBundle, savePlan, createAssignment, updateAssignment, saveReturn,
    createClaim, addClaimSupport, evaluateClaim, evaluateSupportRows,
    createNixReview, ensureReview, reviewItem, setPromotionEligibility, runAnalyst,
    createProposedClaim, discardProposedClaim, approveProposedSupport,
    promoteReview, acceptNixProjection, log
  });
})(window);
