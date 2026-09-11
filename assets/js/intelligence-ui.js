// SID // Phase 3A Intelligence workspace UI
(function (global) {
  "use strict";

  let state = null;
  const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const label = value => String(value || "NOT STARTED").replaceAll("_", " ").toUpperCase();
  const options = (rows, value, title, blank) => `${blank ? `<option value="">${esc(blank)}</option>` : ""}${rows.map(row => `<option value="${esc(row[value])}">${esc(typeof title === "function" ? title(row) : row[title])}</option>`).join("")}`;
  const field = (name, title, type, value, choices, required) => {
    const req = required ? " required" : "";
    if (type === "textarea") return `<div class="field full"><label>${title}</label><textarea name="${name}"${req}>${esc(value || "")}</textarea></div>`;
    if (type === "select") return `<div class="field"><label>${title}</label><select name="${name}"${req}>${choices}</select></div>`;
    return `<div class="field"><label>${title}</label><input name="${name}" type="${type || "text"}" value="${esc(value || "")}"${req}></div>`;
  };

  function ensureModal() {
    if (document.getElementById("intelligenceModal")) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="modal" id="intelligenceModal"><div class="dialog"><div class="dialog-head"><div><h2 id="intelligenceModalTitle">INTELLIGENCE RECORD</h2><div class="report-code" id="intelligenceModalCode"></div></div><button class="button" type="button" onclick="SIDIntelligenceUI.close()">CLOSE</button></div><form id="intelligenceForm"><div class="form-grid" id="intelligenceFields"></div><div class="form-actions"><button class="button primary" type="submit">SAVE INTELLIGENCE</button></div><div class="message" id="intelligenceMessage"></div></form></div></div>`);
    document.getElementById("intelligenceForm").addEventListener("submit", save);
  }

  async function refresh() {
    const root = document.getElementById("intelligencePanel");
    if (!root || !selectedBundle?.report) return;
    root.innerHTML = `<div class="record"><strong>INTELLIGENCE ENGINE</strong><small>LOADING INTERNAL WORKFLOW...</small></div>`;
    try {
      state = await global.IntelligenceEngine.getBundle(selectedBundle.report.id);
      render(root);
    } catch (error) {
      console.error("SID INTELLIGENCE LOAD ERROR:", error);
      root.innerHTML = `<div class="record"><strong>INTELLIGENCE ENGINE ERROR</strong><p>${esc(error.message)}</p></div>`;
    }
  }

  function supportEvaluation(claim) {
    return global.IntelligenceEngine.evaluateSupportRows(claim, state.support.filter(row => row.claim_id === claim.id));
  }

  function render(root) {
    const plan = state.plan;
    root.innerHTML = `
      <div class="record">
        <strong>INVESTIGATION PLAN</strong><small>${label(plan?.status)}</small>
        ${plan ? `<p>${esc(plan.question_type)}</p><span>${plan.proposed_divisions.map(row => `${esc(row.analyst)} // ${esc(row.disposition)} — ${esc(row.relevance)}`).join("<br>") || "NO DIVISIONS PROPOSED"}</span>` : `<p>No intelligence plan filed.</p>`}
        <div class="record-actions"><button class="button" onclick="SIDIntelligenceUI.open('plan')">${plan ? "EDIT PLAN" : "+ INVESTIGATION PLAN"}</button>${plan ? `<button class="button" onclick="SIDIntelligenceUI.open('assignment')">+ ASSIGN ANALYST</button>` : ""}</div>
      </div>
      <div class="record">
        <strong>ANALYST ASSIGNMENTS</strong><small>${state.assignments.length} ASSIGNMENT(S)</small>
        <div class="record-list">${state.assignments.map(row => { const run=(state.runs||[]).find(item=>item.assignment_id===row.id); const active=run&&["QUEUED","RUNNING"].includes(run.status); return `<div class="record-item"><b>${esc(row.analyst)} // ${esc(row.division)}</b><span>${esc(row.question)}</span><span>${label(row.status)} // PRIORITY ${row.priority}${run ? ` // LAST RUN: ${esc(run.status)} // ${esc(run.output_validation_status)}` : ""}</span><div class="record-actions">${row.status !== "COMPLETE" ? `<button class="button" ${active?'disabled':''} onclick="SIDIntelligenceUI.run('${row.id}',this)">${active?'RUNNING...':(run?.status==='COMPLETE'?'RUN AGAIN':'RUN ANALYST')}</button><button class="button" onclick="SIDIntelligenceUI.open('return','${row.id}')">RECORD RETURN</button>` : `<span>RETURN READY FOR REVIEW</span>`}</div></div>`; }).join("") || "<span>NO ASSIGNMENTS</span>"}</div>
      </div>
      <div class="record">
        <strong>ANALYST RUN HISTORY</strong><small>${(state.runs||[]).length} RUN(S)</small>
        <div class="record-list">${(state.runs||[]).map(row => `<div class="record-item"><b>${esc(row.analyst)} // ${esc(row.status)}</b><span>${esc(row.provider)} / ${esc(row.model)} // PROMPT ${esc(row.prompt_version)} // SCHEMA ${esc(row.schema_version)}</span><span>${row.completed_at ? new Date(row.completed_at).toLocaleString() : "IN PROGRESS"} // VALIDATION: ${esc(row.output_validation_status)}</span>${row.error?`<span>${esc(row.error)}</span>`:""}${(row.proposed_claims||[]).map((claim,index)=>`<div class="record-item"><b>PROPOSED CLAIM // ${esc(claim.operator_status||'PENDING')}</b><span>${esc(claim.claim_text)}</span><span>${esc(claim.reasoning_summary)}</span>${!claim.operator_status?`<div class="record-actions"><button class="button" onclick="SIDIntelligenceUI.open('proposedClaim','${row.id}:${index}')">CREATE / EDIT CLAIM</button><button class="button danger" onclick="SIDIntelligenceUI.discardClaim('${row.id}',${index})">DISCARD</button></div>`:""}</div>`).join("")}${(row.proposed_support||[]).map((item,index)=>`<div class="record-item"><b>PROPOSED SUPPORT // ${esc(item.operator_status||'PENDING')}</b><span>${esc(item.lineage_key)}</span>${!item.operator_status?`<button class="button" onclick="SIDIntelligenceUI.approveSupport('${row.id}',${index})">ATTACH SUPPORT</button>`:""}</div>`).join("")}</div>`).join("") || "<span>NO RUNS</span>"}</div>
      </div>
      <div class="record">
        <strong>ANALYST RETURNS</strong><small>${state.returns.length} STRUCTURED RETURN(S)</small>
        <div class="record-list">${state.returns.map(row => `<div class="record-item"><b>${esc(row.analyst)} // ${label(row.status)}</b><span>${esc(row.summary)}</span><span>CONFIDENCE: ${esc(row.confidence)} // LIMITATIONS: ${row.limitations.length}</span></div>`).join("") || "<span>NO RETURNS</span>"}</div>
        ${state.returns.length ? `<button class="button" onclick="SIDIntelligenceUI.open('claim')">+ CLAIM FROM RETURN</button>` : ""}
      </div>
      <div class="record">
        <strong>CLAIM LEDGER</strong><small>${state.claims.length} CLAIM(S)</small>
        <div class="record-list">${state.claims.map(row => { const e = supportEvaluation(row); return `<div class="record-item"><b>${esc(row.claim_kind)} // ${esc(row.status)}</b><span>${esc(row.claim_text)}</span><span>RULE 003: ${row.rule_003_applies ? (e.rule003Satisfied ? "SATISFIED" : "NOT SATISFIED") : "NOT APPLIED"} // ${e.independentCount} INDEPENDENT LINEAGE(S) // ${e.derivativeCount} DERIVATIVE/SHARED // ${e.contradictions.length} CONTRADICTION(S)</span><div class="record-actions"><button class="button" onclick="SIDIntelligenceUI.open('support','${row.id}')">+ PROVENANCE</button></div></div>`; }).join("") || "<span>NO CLAIMS</span>"}</div>
      </div>
      <div class="record">
        <strong>PROVENANCE LEDGER</strong><small>${state.support.length} SUPPORT RECORD(S)</small>
        <div class="record-list">${state.support.map(row => `<div class="record-item"><b>${esc(row.originating_analyst)} // ${esc(row.stance)}</b><span>LINEAGE: ${esc(row.lineage_key || "UNKNOWN")} // ${esc(row.independence_status)} // ${esc(row.verification_status)}</span><span>${esc(row.notes)}</span></div>`).join("") || "<span>NO PROVENANCE</span>"}</div>
      </div>
      <div class="record">
        <strong>NIX REVIEW HISTORY</strong><small>${state.nixReviews.length} REVIEW(S)</small>
        <div class="record-list">${state.nixReviews.map(row => `<div class="record-item"><b>${esc(row.verdict)}</b><span>${label(row.status)} // SUGGESTED CONFIDENCE: ${esc(row.suggested_confidence)}</span><span>${esc(row.overall_convergence)}</span></div>`).join("") || "<span>NO INTERNAL NIX REVIEW</span>"}</div>
        ${state.claims.length ? `<button class="button" onclick="SIDIntelligenceUI.open('nix')">+ STRUCTURED NIX REVIEW</button>` : ""}
      </div>
      <div class="record">
        <strong>OPERATOR REVIEW QUEUE</strong><small>${state.reviewQueue.filter(row => row.status === "PENDING").length} PENDING</small>
        <div class="record-list">${state.reviewQueue.map(row => `<div class="record-item"><b>${esc(row.review_type)} // ${esc(row.status)}</b><span>${row.eligible_for_promotion ? "ELIGIBLE FOR PROMOTION" : "NOT ELIGIBLE"}${row.promoted_section_id ? " // PROMOTED" : ""}</span><div class="record-actions">${row.status === "PENDING" ? `<button class="button" onclick="SIDIntelligenceUI.review('${row.id}','ACCEPT FINDING')">ACCEPT</button><button class="button danger" onclick="SIDIntelligenceUI.review('${row.id}','REJECT FINDING')">REJECT</button><button class="button" onclick="SIDIntelligenceUI.review('${row.id}','REQUEST MORE RESEARCH')">MORE RESEARCH</button>` : ""}${row.status === "ACCEPTED" && !row.eligible_for_promotion && !row.nix_review_id ? `<button class="button" onclick="SIDIntelligenceUI.eligible('${row.id}')">MARK ELIGIBLE</button>` : ""}${row.status === "ACCEPTED" && row.eligible_for_promotion && !row.promoted_section_id ? `<button class="button gold" onclick="SIDIntelligenceUI.promote('${row.id}')">PROMOTE FINDING</button>` : ""}</div></div>`).join("") || "<span>REVIEW QUEUE EMPTY</span>"}</div>
      </div>`;
  }

  function open(kind, relatedId) {
    ensureModal();
    const form = document.getElementById("intelligenceForm");
    form.dataset.kind = kind;
    form.dataset.relatedId = relatedId || "";
    const plan = state.plan;
    let html = "", title = label(kind);
    if (kind === "plan") {
      title = "INVESTIGATION PLAN";
      html = field("question_type","QUESTION TYPE","text",plan?.question_type,"",true) + field("proposed_divisions","PROPOSED DIVISIONS — ANALYST | REQUIRED/CONDITIONAL/NOT REQUIRED | WHY","textarea",plan?.proposed_divisions.map(row => `${row.analyst} | ${row.disposition} | ${row.relevance}`).join("\n"),"",true) + field("required_evidence","REQUIRED EVIDENCE — ONE PER LINE","textarea",plan?.required_evidence.join("\n")) + field("known_gaps","KNOWN GAPS","textarea",plan?.known_gaps.join("\n")) + field("research_questions","RESEARCH QUESTIONS","textarea",plan?.research_questions.join("\n")) + field("dependencies","DEPENDENCIES","textarea",plan?.dependencies.join("\n")) + field("recommended_order","RECOMMENDED ORDER","textarea",plan?.recommended_order.join("\n")) + field("stop_conditions","STOP CONDITIONS","textarea",plan?.stop_conditions.join("\n")) + field("status","PLAN STATUS","select",plan?.status,options(["DRAFT","ACTIVE","COMPLETE","NEEDS REVIEW"].map(x=>({v:x})),"v","v"));
    } else if (kind === "assignment") {
      title = "ANALYST ASSIGNMENT";
      html = field("analyst","ANALYST","select","",options(global.SIDAnalystRegistry.codes.map(v=>({v})),"v",row=>`${row.v} // ${global.SIDAnalystRegistry.get(row.v).division}`),true) + field("question","ASSIGNMENT QUESTION","textarea","","",true) + field("objective","OBJECTIVE","textarea") + field("required_inputs","REQUIRED INPUTS — ONE PER LINE","textarea") + field("priority","PRIORITY 0–100","number",50);
    } else if (kind === "return") {
      title = "STRUCTURED ANALYST RETURN";
      const assignment = state.assignments.find(row => row.id === relatedId);
      html = `<input type="hidden" name="assignment_id" value="${esc(relatedId)}">` + field("summary",`${assignment?.analyst || "ANALYST"} SUMMARY`,`textarea`,"","",true) + field("calculations","CALCULATIONS — ONE PER LINE","textarea") + field("interpretations","INTERPRETATIONS","textarea") + field("contradictions","CONTRADICTIONS","textarea") + field("limitations","LIMITATIONS","textarea") + field("open_questions","OPEN QUESTIONS","textarea") + field("confidence","CONFIDENCE","select","",options(["UNRESOLVED","LOW","MODERATE","HIGH","CONFIRMED"].map(v=>({v})),"v","v")) + field("recommended_next_step","RECOMMENDED NEXT STEP","textarea");
    } else if (kind === "claim") {
      title = "CLAIM LEDGER RECORD";
      html = field("originating_return_id","ORIGINATING RETURN","select","",options(state.returns,"id",row=>`${row.analyst} // ${row.summary.slice(0,70)}`),"SELECT RETURN",true) + field("claim_text","CLAIM","textarea","","",true) + field("claim_kind","CLAIM TYPE","select","",options(["SOURCE","FACT","CLAIM","INTERPRETATION","INFERENCE","CONTRADICTION","UNRESOLVED QUESTION","REJECTED CONNECTION","FINAL FINDING"].map(v=>({v})),"v","v")) + field("significance","SIGNIFICANCE","select","",options(["STANDARD","MAJOR","CRITICAL"].map(v=>({v})),"v","v")) + field("rule_003_applies","APPLY RULE 003","select","",options([{v:"false",t:"NO"},{v:"true",t:"YES — OPERATOR DESIGNATED MAJOR CLAIM"}],"v","t"));
    } else if (kind === "proposedClaim") {
      title = "REVIEW PROPOSED CLAIM";
      const [runId,indexText]=relatedId.split(":"); const proposal=(state.runs.find(row=>row.id===runId)?.proposed_claims||[])[Number(indexText)]||{};
      html = field("claim_text","CLAIM","textarea",proposal.claim_text,"",true) + field("claim_kind","CLAIM TYPE","select",proposal.claim_kind,options(["SOURCE","FACT","CLAIM","INTERPRETATION","INFERENCE","CONTRADICTION","UNRESOLVED QUESTION","REJECTED CONNECTION","FINAL FINDING"].map(v=>({v})),"v","v")) + field("significance","SIGNIFICANCE","select",proposal.significance,options(["STANDARD","MAJOR","CRITICAL"].map(v=>({v})),"v","v")) + field("rule_003_applies","APPLY RULE 003","select",String(proposal.rule_003_suggested===true),options([{v:"false",t:"NO"},{v:"true",t:"YES — OPERATOR DESIGNATED"}],"v","t"));
    } else if (kind === "support") {
      title = "CLAIM PROVENANCE";
      html =
        `<input type="hidden" name="claim_id" value="${esc(relatedId)}">` +
        field("originating_analyst","ORIGINATING ANALYST","select","",options([...global.SIDAnalystRegistry.codes,"OPERATOR"].map(v=>({v})),"v","v"),true) +
        field("analyst_return_id","ANALYST RETURN","select","",options(state.returns,"id",row=>`${row.analyst} // ${row.summary.slice(0,60)}`,"NONE")) +
        field("evidence_id","EVIDENCE","select","",options(selectedBundle.evidence || [],"id","title","NONE")) +
        field("source_id","SOURCE","select","",options(selectedBundle.sources || [],"id","title","NONE")) +
        field("stance","STANCE","select","",options(["SUPPORTS","CONTRADICTS","NEUTRAL","REJECTS"].map(v=>({v})),"v","v")) +
        field("support_type","SUPPORT TYPE","text","TEXTUAL") +
        field("independence_status","INDEPENDENCE","select","",options(["INDEPENDENT","DERIVATIVE","SHARED SOURCE","UNKNOWN"].map(v=>({v})),"v","v")) +
        field("verification_status","VERIFICATION","select","",options(["UNVERIFIED","CHECKED","VERIFIED","DISPUTED","REJECTED"].map(v=>({v})),"v","v")) +
        field("lineage_key","LINEAGE KEY","text","","",true) +
        field("derived_from_support_id","DERIVED FROM SUPPORT","select","",options(state.support,"id",row=>`${row.originating_analyst} // ${row.lineage_key || "UNKNOWN"}`,"NONE")) +
        field("notes","PROVENANCE NOTES","textarea");
    } else if (kind === "nix") {
      title = "NIX STRUCTURED REVIEW";
      html = field("systems_reviewed","SYSTEMS REVIEWED","textarea",[...new Set(state.returns.map(row=>row.analyst))].join("\n"),"",true) + field("agreements","AGREEMENTS","textarea") + field("contradictions","CONTRADICTIONS","textarea") + field("unresolved_links","UNRESOLVED LINKS","textarea") + field("rejected_connections","REJECTED CONNECTIONS","textarea") + field("overall_convergence","OVERALL CONVERGENCE","textarea","","",true) + field("verdict","VERDICT","select","",options(["CONVERGENCE CONFIRMED","PARTIAL CONVERGENCE","INSUFFICIENT EVIDENCE","CONNECTION REJECTED","CONTRADICTION UNRESOLVED"].map(v=>({v})),"v","v")) + field("suggested_confidence","SUGGESTED CONFIDENCE","select","",options(["UNRESOLVED","LOW","MODERATE","HIGH","CONFIRMED"].map(v=>({v})),"v","v"));
    }
    document.getElementById("intelligenceModalTitle").textContent = title;
    document.getElementById("intelligenceModalCode").textContent = selectedBundle.report.report_code;
    document.getElementById("intelligenceFields").innerHTML = html;
    document.getElementById("intelligenceMessage").textContent = "";
    document.getElementById("intelligenceModal").classList.add("show");
  }

  async function save(event) {
    event.preventDefault();
    const message = document.getElementById("intelligenceMessage");
    const values = Object.fromEntries(new FormData(event.target).entries());
    const kind = event.target.dataset.kind;
    const fileId = selectedBundle.report.id;
    message.textContent = "FILING INTELLIGENCE...";
    try {
      if (kind === "plan") {
        values.proposed_divisions = values.proposed_divisions.split(/\r?\n/).filter(Boolean).map(line => { const [analyst, disposition, ...why] = line.split("|").map(x=>x.trim()); return { analyst: analyst.toUpperCase(), division: global.SIDAnalystRegistry.get(analyst)?.division || "", disposition: (disposition || "CONDITIONAL").toUpperCase(), relevance: why.join(" | ") }; });
        await global.IntelligenceEngine.savePlan(fileId, values);
      }
      if (kind === "assignment") await global.IntelligenceEngine.createAssignment(fileId, { ...values, plan_id: state.plan.id });
      if (kind === "return") await global.IntelligenceEngine.saveReturn(fileId, values);
      if (kind === "claim") await global.IntelligenceEngine.createClaim(fileId, values);
      if (kind === "proposedClaim") { const [runId,index]=event.target.dataset.relatedId.split(":"); await global.IntelligenceEngine.createProposedClaim(runId,Number(index),values); }
      if (kind === "support") await global.IntelligenceEngine.addClaimSupport(fileId, values);
      if (kind === "nix") {
        const assessments = await Promise.all(state.claims.map(async claim => { const e = await global.IntelligenceEngine.evaluateClaim(claim.id, false); return { claim_id: claim.id, independent_support: e.independentCount, derivative_support: e.derivativeCount, contradictions: e.contradictions.length, rule_003_result: claim.rule_003_applies ? (e.rule003Satisfied ? "SATISFIED" : "NOT SATISFIED") : "NOT APPLIED", verdict: claim.sid_verdict || (e.rule003Satisfied ? "PARTIAL CONVERGENCE" : "INSUFFICIENT EVIDENCE") }; }));
        await global.IntelligenceEngine.createNixReview(fileId, { ...values, claim_assessments: assessments });
      }
      close();
      await refresh();
    } catch (error) {
      console.error("SID INTELLIGENCE SAVE ERROR:", error);
      message.textContent = error.message || "UNABLE TO SAVE INTELLIGENCE";
    }
  }

  async function assignment(id, status) { await global.IntelligenceEngine.updateAssignment(id, { status }); await refresh(); }
  async function run(id, button) { button.disabled=true; button.textContent="RUNNING..."; try { await global.IntelligenceEngine.runAnalyst(selectedBundle.report.id,id); await refresh(); } catch(error) { console.error("SID ANALYST RUN ERROR:",error); alert(error.message); await refresh(); } }
  async function discardClaim(runId,index) { if(confirm("DISCARD THIS PROPOSED CLAIM?")){ await global.IntelligenceEngine.discardProposedClaim(runId,index); await refresh(); } }
  async function approveSupport(runId,index) { try { await global.IntelligenceEngine.approveProposedSupport(runId,index); await refresh(); } catch(error) { alert(error.message); } }
  async function review(id, action) { await global.IntelligenceEngine.reviewItem(id, action, "Manual Phase 3A operator review."); selectedBundle = await global.ResearchEngine.getBundle(selectedBundle.report.id); renderWorkspace(); }
  async function eligible(id) { await global.IntelligenceEngine.setPromotionEligibility(id, true); await refresh(); }
  async function promote(id) { await global.IntelligenceEngine.promoteReview(id); selectedBundle = await global.ResearchEngine.getBundle(selectedBundle.report.id); renderWorkspace(); renderSources(); }
  function close() { document.getElementById("intelligenceModal")?.classList.remove("show"); }

  global.renderIntelligencePanel = refresh;
  global.SIDIntelligenceUI = Object.freeze({ refresh, open, close, assignment, run, discardClaim, approveSupport, review, eligible, promote });
})(window);
