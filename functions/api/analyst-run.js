// SID // Phase 3B controlled analyst execution boundary
// Secrets and full prompts stay in the Cloudflare server environment.
const SUPABASE_URL = 'https://xntqxdqqhdjvlxovawzn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zsq-1wRl_I3yppqQI_h09A_oLChn78T';
const DEFAULT_MODEL_URL = 'https://oracle-api.capcancerian3.workers.dev';
const PROVIDER = 'anthropic';
const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'sid-analysts-1.1';
const SCHEMA_VERSION = 'sid-return-1.1';
const INITIAL_MAX_TOKENS = 1800;
const RETRY_MAX_TOKENS = 4096;
const CONFIDENCE = ['UNRESOLVED','LOW','MODERATE','HIGH','CONFIRMED'];
const VERDICTS = ['CONVERGENCE CONFIRMED','PARTIAL CONVERGENCE','INSUFFICIENT EVIDENCE','CONNECTION REJECTED','CONTRADICTION UNRESOLVED'];
const STRING_ARRAY = {type:'array',items:{type:'string'}};
const CLAIM_SCHEMA = {
  type:'object',
  additionalProperties:false,
  properties:{
    claim_text:{type:'string'},
    claim_kind:{type:'string'},
    significance:{type:'string'},
    rule_003_suggested:{type:'boolean'},
    support_refs:{type:'array',items:{type:'string'}},
    source_refs:{type:'array',items:{type:'string'}},
    evidence_refs:{type:'array',items:{type:'string'}},
    reasoning_summary:{type:'string'}
  },
  required:['claim_text','claim_kind','significance','rule_003_suggested','support_refs','source_refs','evidence_refs','reasoning_summary']
};
const SID_RETURN_SCHEMA = {
  type:'object',
  additionalProperties:false,
  properties:{
    analyst:{type:'string'},
    division:{type:'string'},
    assignment_question:{type:'string'},
    summary:{type:'string'},
    claims:{type:'array',items:CLAIM_SCHEMA},
    calculations:STRING_ARRAY,
    interpretations:STRING_ARRAY,
    contradictions:STRING_ARRAY,
    limitations:STRING_ARRAY,
    open_questions:STRING_ARRAY,
    confidence:{type:'string',enum:CONFIDENCE},
    recommended_next_step:{type:'string'},
    verdict:{type:['string','null'],enum:[...VERDICTS,null]},
    systems_reviewed:{type:['array','null'],items:{type:'string'}},
    agreements:{type:['array','null'],items:{type:'string'}},
    unresolved_links:{type:['array','null'],items:{type:'string'}},
    rejected_connections:{type:['array','null'],items:{type:'string'}},
    overall_convergence:{type:['string','null']}
  },
  required:['analyst','division','assignment_question','summary','claims','calculations','interpretations','contradictions','limitations','open_questions','confidence','recommended_next_step']
};
const RULES = {
  CENTRA:'Separate astronomical/chart facts from interpretation; identify the system; never invent chart data; cite stored inputs; flag missing chart data.',
  LUX:'Prioritize primary/original text; separate text, translation, historical interpretation, and modern interpretation; identify uncertainty; never fabricate quotations or manuscripts.',
  CIPHER:'Show calculations and method; coincidence is not significance; never cherry-pick values.',
  SCAR:'Describe behavior; do not diagnose mental disorders; separate observation from interpretation.',
  ASH:'Separate historical symbolism from modern/projective symbolism; never claim symbolic parallel as factual causation.',
  LUNA:'Separate lunar/temporal data from interpretation; identify the timing basis.',
  NIX:'Use only structured persisted records; do not invent evidence; audit support, lineage, contradiction, derivation and convergence; agreement is not required.'
};

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({error:'AUTHENTICATION REQUIRED'},401);
  let body;
  try { body = await request.json(); } catch { return json({error:'INVALID REQUEST JSON'},400); }
  const idempotency = String(request.headers.get('Idempotency-Key') || body.idempotency_key || '').trim();
  if (!idempotency) return json({error:'IDEMPOTENCY KEY REQUIRED'},400);
  const db = api(auth);
  const user = await getUser(auth);
  if (!user) return json({error:'INVALID SESSION'},401);
  const admin = await db.get(`archive_admins?user_id=eq.${user.id}&select=user_id`);
  if (!admin.length) return json({error:'ARCHIVE ADMIN REQUIRED'},403);
  const assignments = await db.get(`archive_analyst_assignments?id=eq.${encodeURIComponent(body.assignment_id)}&archive_file_id=eq.${encodeURIComponent(body.archive_file_id)}&select=*`);
  const assignment = assignments[0];
  if (!assignment) return json({error:'ASSIGNMENT DOES NOT BELONG TO FILE'},404);
  const existing = await db.get(`archive_analyst_runs?assignment_id=eq.${assignment.id}&idempotency_key=eq.${encodeURIComponent(idempotency)}&select=*`);
  if (existing[0]) return json({run:existing[0],duplicate:true},200);
  if (body.analyst && String(body.analyst).toUpperCase() !== assignment.analyst) return json({error:'ANALYST DOES NOT MATCH ASSIGNMENT'},400);

  let run;
  try {
    const context = await buildContext(db, assignment);
    run = (await db.post('archive_analyst_runs', {
      archive_file_id:assignment.archive_file_id, assignment_id:assignment.id, analyst:assignment.analyst,
      division:assignment.division, requested_by:user.id, status:'QUEUED', provider:PROVIDER, model:MODEL,
      prompt_version:PROMPT_VERSION, schema_version:SCHEMA_VERSION, idempotency_key:idempotency, input_snapshot:context
    }))[0];
    await timeline(db, assignment.archive_file_id, user.id, 'ANALYST RUN REQUESTED', `${assignment.analyst} // ${run.id}`, {run_id:run.id,assignment_id:assignment.id});
    run = (await db.patch(`archive_analyst_runs?id=eq.${run.id}`, {status:'RUNNING',started_at:new Date().toISOString()}))[0];
    await db.patch(`archive_analyst_assignments?id=eq.${assignment.id}`, {status:'IN PROGRESS',started_at:new Date().toISOString()});
    await timeline(db, assignment.archive_file_id, user.id, assignment.analyst === 'NIX' ? 'NIX RUN REQUESTED' : 'ANALYST RUN STARTED', `${assignment.analyst} // ${run.id}`, {run_id:run.id});
    const output = await executeWithSingleRetry(
      maxTokens => executeModel(env.ANALYST_MODEL_URL || DEFAULT_MODEL_URL, assignment, context, maxTokens),
      async firstError => { run = (await db.patch(`archive_analyst_runs?id=eq.${run.id}`, {retry_count:1,error:diagnostic(firstError,'RETRYING')}))[0]; }
    );
    const validation = validateOutput(output, assignment, context);
    if (!validation.valid) {
      const category = validation.errors.some(error => /SOURCE ID|EVIDENCE ID|REFERENCE/i.test(error)) ? 'REFERENCE VALIDATION FAILURE' : 'SCHEMA VALIDATION FAILURE';
      run = (await db.patch(`archive_analyst_runs?id=eq.${run.id}`, {status:'INVALID OUTPUT',output_validation_status:'INVALID',validation_errors:validation.errors,error:diagnostic({category,message:'Structured output validation failed'},'APPLICATION VALIDATION'),completed_at:new Date().toISOString()}))[0];
      await timeline(db, assignment.archive_file_id, user.id, 'ANALYST OUTPUT INVALID', `${assignment.analyst} // ${validation.errors.join('; ')}`, {run_id:run.id});
      return json({run,validation},422);
    }
    let result;
    if (assignment.analyst === 'NIX') result = await persistNix(db, assignment, output, user.id);
    else result = await persistReturn(db, assignment, output);
    run = (await db.patch(`archive_analyst_runs?id=eq.${run.id}`, {status:'COMPLETE',output_validation_status:'VALID',analyst_return_id:result.return?.id || null,proposed_claims:output.claims || [],proposed_support:validation.proposedSupport,proposed_evidence:output.proposed_evidence || [],proposed_sources:output.proposed_sources || [],completed_at:new Date().toISOString()}))[0];
    await db.patch(`archive_analyst_assignments?id=eq.${assignment.id}`, {status:'COMPLETE',completed_at:new Date().toISOString()});
    await timeline(db, assignment.archive_file_id, user.id, 'ANALYST RUN COMPLETED', `${assignment.analyst} // ${run.id}`, {run_id:run.id});
    await timeline(db, assignment.archive_file_id, user.id, assignment.analyst === 'NIX' ? 'NIX RETURN SUBMITTED' : 'ANALYST RETURN SUBMITTED', `${assignment.analyst} // READY FOR REVIEW`, {run_id:run.id,analyst_return_id:result.return?.id,nix_review_id:result.nix?.id});
    return json({run,...result,validation},200);
  } catch (error) {
    if (run?.id) {
      await db.patch(`archive_analyst_runs?id=eq.${run.id}`, {status:'FAILED',error:diagnostic(error,'MODEL RESPONSE'),completed_at:new Date().toISOString()}).catch(()=>{});
      await db.patch(`archive_analyst_assignments?id=eq.${assignment.id}`, {status:'NEEDS REVIEW'}).catch(()=>{});
      await timeline(db, assignment.archive_file_id, user.id, 'ANALYST RUN FAILED', `${assignment.analyst} // ${error.category || String(error.message || error)}`, {run_id:run.id}).catch(()=>{});
    }
    const status = /duplicate key|one_active_assignment/i.test(String(error.message || error)) ? 409 : 502;
    return json({error:'ANALYST RUN FAILED',detail:String(error.message || error)},status);
  }
}

async function buildContext(db, a) {
  const [files,evidence,sources,sections,connections,claims,support,returns] = await Promise.all([
    db.get(`archive_files?id=eq.${a.archive_file_id}&select=id,code,name,investigation_question,current_scope,unresolved_questions`),
    db.get(`archive_evidence?archive_file_id=eq.${a.archive_file_id}&select=id,title,excerpt,finding,evidence_type,classification,reliability`),
    db.get(`archive_sources?archive_file_id=eq.${a.archive_file_id}&select=id,title,url,source_type,notes,verification_status`),
    db.get(`archive_sections?archive_file_id=eq.${a.archive_file_id}&select=id,title,content,division,confidence_label`),
    db.get(`archive_connections?archive_file_id=eq.${a.archive_file_id}&select=id,connected_archive_id,connected_label,connection_type,rationale,confidence_label`),
    db.get(`archive_claims?archive_file_id=eq.${a.archive_file_id}&select=id,claim_text,status,rule_003_applies`),
    db.get(`archive_claim_support?archive_file_id=eq.${a.archive_file_id}&select=id,claim_id,evidence_id,source_id,stance,lineage_key,independence_status,verification_status`),
    db.get(`archive_analyst_returns?archive_file_id=eq.${a.archive_file_id}&status=eq.ACCEPTED&select=id,analyst,summary,contradictions,limitations`)
  ]);
  const file=files[0]; if(!file) throw new Error('ARCHIVE FILE NOT FOUND');
  return {case_code:file.code,case_question:file.investigation_question,assignment_question:a.question,objective:a.objective,required_inputs:a.required_inputs,relevant_evidence:evidence,relevant_sources:sources,relevant_accepted_findings:sections,known_contradictions:[...returns.flatMap(x=>x.contradictions||[]),...support.filter(x=>x.stance==='CONTRADICTS')],known_gaps:file.unresolved_questions,analyst_specific_rules:RULES[a.analyst],claims:a.analyst==='NIX'?claims:undefined,claim_support:a.analyst==='NIX'?support:undefined,analyst_returns:a.analyst==='NIX'?returns:undefined,connections:a.analyst==='NIX'?connections:undefined};
}

async function executeModel(url, assignment, context, maxTokens = INITIAL_MAX_TOKENS) {
  const system=`You are ${assignment.analyst}, SID ${assignment.division}. Follow the supplied analyst rule. Return JSON only. Never invent IDs or evidence. Required keys: analyst, division, assignment_question, summary, claims, calculations, interpretations, contradictions, limitations, open_questions, confidence, recommended_next_step. Each claim needs claim_text, claim_kind, significance, rule_003_suggested, support_refs, source_refs, evidence_refs, reasoning_summary. For NIX also return verdict, systems_reviewed, agreements, unresolved_links, rejected_connections, overall_convergence.`;
  const payload={model:MODEL,max_tokens:maxTokens,system,messages:[{role:'user',content:JSON.stringify(context)}],output_config:{format:{type:'json_schema',schema:SID_RETURN_SCHEMA}}};
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const requestId=res.headers.get('request-id')||res.headers.get('x-request-id')||null;
  if(!res.ok) throw modelError('UNEXPECTED PROVIDER RESPONSE',`MODEL HTTP ${res.status}`,{provider_request_id:requestId,retryable:res.status===429||res.status>=500});
  let data;
  try { data=await res.json(); }
  catch { throw modelError('UNEXPECTED PROVIDER RESPONSE','MODEL RESPONSE WAS NOT JSON',{provider_request_id:requestId,retryable:false}); }
  if(data?.type==='error'||data?.error){
    const providerErrorType=String(data.error?.type||'unknown_error');
    const retryable=/rate_limit|overloaded|api_error/i.test(providerErrorType);
    throw modelError('UNEXPECTED PROVIDER RESPONSE',`MODEL PROVIDER ERROR ${providerErrorType}`,{provider_request_id:requestId||data.request_id||null,retryable});
  }
  const stopReason=String(data.stop_reason||'').toLowerCase();
  const meta={stop_reason:stopReason||null,output_tokens:data.usage?.output_tokens??null,provider_request_id:requestId||data.request_id||null};
  if(stopReason==='max_tokens') throw modelError('MAX TOKENS','MODEL OUTPUT REACHED TOKEN LIMIT',{...meta,retryable:true});
  if(stopReason==='refusal') throw modelError('REFUSAL','MODEL REFUSED THE REQUEST',{...meta,retryable:false});
  if(stopReason && stopReason!=='end_turn' && stopReason!=='stop_sequence') throw modelError('UNEXPECTED PROVIDER RESPONSE',`UNEXPECTED STOP REASON ${stopReason}`,{...meta,retryable:false});
  const block=Array.isArray(data.content)?data.content.find(item=>item?.type==='text'&&typeof item.text==='string'):null;
  const raw=block?.text ?? (typeof data.output_text==='string'?data.output_text:null) ?? (typeof data.text==='string'?data.text:null);
  if(!raw) throw modelError('MISSING TEXT','MODEL RESPONSE CONTAINED NO TEXT OUTPUT',{...meta,retryable:false});
  const cleaned=String(raw).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(cleaned);}catch{throw modelError('INVALID JSON','MODEL RETURNED INVALID JSON',{...meta,retryable:true});}
}

async function executeWithSingleRetry(executor,onRetry=async()=>{}){
  try { return await executor(INITIAL_MAX_TOKENS); }
  catch(firstError){
    if(!firstError.retryable) throw firstError;
    await onRetry(firstError);
    return executor(firstError.category==='MAX TOKENS'?RETRY_MAX_TOKENS:INITIAL_MAX_TOKENS);
  }
}

function modelError(category,message,metadata={}){
  const error=new Error(message); error.category=category; Object.assign(error,metadata); return error;
}

function diagnostic(error,stage){
  return JSON.stringify({
    response_category:error.category||'UNEXPECTED PROVIDER RESPONSE',
    validation_stage:stage,
    stop_reason:error.stop_reason||null,
    output_tokens:Number.isFinite(error.output_tokens)?error.output_tokens:null,
    provider_request_id:error.provider_request_id||null,
    retry_reason:stage==='RETRYING'?(error.category||null):null,
    message:String(error.message||error).slice(0,500)
  }).slice(0,2000);
}

function validateOutput(o,a,c){
  const errors=[]; if(!o||typeof o!=='object'||Array.isArray(o)) return {valid:false,errors:['OUTPUT MUST BE AN OBJECT'],proposedSupport:[]};
  for(const k of ['analyst','division','assignment_question','summary','claims','calculations','interpretations','contradictions','limitations','open_questions','confidence','recommended_next_step']) if(o[k]===undefined||o[k]===null) errors.push(`MISSING ${k}`);
  for(const k of ['analyst','division','assignment_question','summary','confidence','recommended_next_step']) if(o[k]!==undefined&&typeof o[k]!=='string') errors.push(`${k} MUST BE A STRING`);
  if(String(o.analyst||'').toUpperCase()!==a.analyst) errors.push('WRONG ANALYST IDENTITY');
  if(String(o.division||'').toUpperCase()!==a.division) errors.push('WRONG DIVISION');
  if(String(o.assignment_question||'')!==a.question) errors.push('WRONG ASSIGNMENT QUESTION');
  if(!CONFIDENCE.includes(String(o.confidence||'').toUpperCase())) errors.push('INVALID CONFIDENCE');
  for(const k of ['claims','calculations','interpretations','contradictions','limitations','open_questions']) if(!Array.isArray(o[k])) errors.push(`${k} MUST BE AN ARRAY`);
  const sourceIds=new Set((c.relevant_sources||[]).map(x=>x.id)), evidenceIds=new Set((c.relevant_evidence||[]).map(x=>x.id)), supportIds=new Set((c.claim_support||[]).map(x=>x.id)); const proposedSupport=[];
  for(const [i,claim] of (Array.isArray(o.claims)?o.claims:[]).entries()){
    if(!claim||typeof claim!=='object'||Array.isArray(claim)){errors.push(`CLAIM ${i+1} MUST BE AN OBJECT`);continue;}
    for(const k of ['claim_text','claim_kind','significance','rule_003_suggested','support_refs','source_refs','evidence_refs','reasoning_summary']) if(claim?.[k]===undefined) errors.push(`CLAIM ${i+1} MISSING ${k}`);
    for(const k of ['claim_text','claim_kind','significance','reasoning_summary']) if(claim[k]!==undefined&&typeof claim[k]!=='string') errors.push(`CLAIM ${i+1} ${k} MUST BE A STRING`);
    if(claim.rule_003_suggested!==undefined&&typeof claim.rule_003_suggested!=='boolean') errors.push(`CLAIM ${i+1} rule_003_suggested MUST BE BOOLEAN`);
    for(const k of ['support_refs','source_refs','evidence_refs']) if(!Array.isArray(claim[k])||claim[k].some(id=>typeof id!=='string')) errors.push(`CLAIM ${i+1} ${k} MUST BE A STRING ARRAY`);
    for(const id of claim?.support_refs||[]) if(!supportIds.has(id)) errors.push(`HALLUCINATED SUPPORT REFERENCE ${id}`);
    for(const id of claim?.source_refs||[]) {if(!sourceIds.has(id)) errors.push(`HALLUCINATED SOURCE ID ${id}`); else proposedSupport.push({claim_index:i,source_id:id,lineage_key:`source:${id}`});}
    for(const id of claim?.evidence_refs||[]) {if(!evidenceIds.has(id)) errors.push(`HALLUCINATED EVIDENCE ID ${id}`); else proposedSupport.push({claim_index:i,evidence_id:id,lineage_key:`evidence:${id}`});}
  }
  if(a.analyst==='NIX'&&!VERDICTS.includes(String(o.verdict||'').toUpperCase())) errors.push('INVALID NIX VERDICT');
  return {valid:errors.length===0,errors,proposedSupport};
}

async function persistReturn(db,a,o){
  const row=(await db.post('archive_analyst_returns',{archive_file_id:a.archive_file_id,assignment_id:a.id,analyst:a.analyst,division:a.division,assignment_question:a.question,summary:String(o.summary),calculations:o.calculations,interpretations:o.interpretations,contradictions:o.contradictions,limitations:o.limitations,open_questions:o.open_questions,confidence:String(o.confidence).toUpperCase(),recommended_next_step:String(o.recommended_next_step),status:'SUBMITTED'}))[0];
  await db.post('archive_review_queue',{archive_file_id:a.archive_file_id,analyst_return_id:row.id,review_type:'ANALYST RETURN'}); return {return:row};
}
async function persistNix(db,a,o,userId){
  const row=(await db.post('archive_nix_reviews',{archive_file_id:a.archive_file_id,status:'COMPLETE',verdict:String(o.verdict).toUpperCase(),systems_reviewed:o.systems_reviewed||[],agreements:o.agreements||[],contradictions:o.contradictions||[],unresolved_links:o.unresolved_links||[],rejected_connections:o.rejected_connections||[],claim_assessments:o.claims||[],overall_convergence:String(o.overall_convergence||o.summary),suggested_confidence:String(o.confidence).toUpperCase(),reviewed_by:userId,completed_at:new Date().toISOString()}))[0];
  await db.post('archive_review_queue',{archive_file_id:a.archive_file_id,nix_review_id:row.id,review_type:'NIX REVIEW'}); return {nix:row};
}
async function getUser(auth){const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:auth,apikey:SUPABASE_KEY}});return r.ok?r.json():null;}
function api(auth){const h={Authorization:auth,apikey:SUPABASE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};const call=async(method,path,body)=>{const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();if(!r.ok)throw new Error(`${method} ${path}: ${r.status} ${t}`);return t?JSON.parse(t):[]};return{get:p=>call('GET',p),post:(p,b)=>call('POST',p,b),patch:(p,b)=>call('PATCH',p,b)};}
async function timeline(db,fileId,actor,event,detail,metadata){await db.post('archive_timeline',{archive_file_id:fileId,event_type:event,detail,metadata,actor_id:actor});}
function json(value,status){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}

export const __test = Object.freeze({SID_RETURN_SCHEMA,executeModel,executeWithSingleRetry,validateOutput,diagnostic});
