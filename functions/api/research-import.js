// SID // Private research-file intake boundary
// Unreviewed material never enters analyst context. Approval projects a vetted
// asset into archive_sources/archive_evidence through an authenticated RPC.
const SUPABASE_URL = 'https://xntqxdqqhdjvlxovawzn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zsq-1wRl_I3yppqQI_h09A_oLChn78T';
const BUCKET = 'sid-research';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['text/plain','text/markdown','text/csv','application/json','text/html','application/pdf']);

export async function onRequestPost({ request }) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({error:'AUTHENTICATION REQUIRED'},401);
  const user = await getUser(auth);
  if (!user) return json({error:'INVALID SESSION'},401);
  const db = api(auth);
  const admin = await db.get(`archive_admins?user_id=eq.${user.id}&select=user_id`);
  if (!admin.length) return json({error:'ARCHIVE ADMIN REQUIRED'},403);

  let input;
  try { input = await readInput(request); }
  catch (error) { return json({error:error.message || 'INVALID RESEARCH IMPORT'},400); }

  const fileId = clean(input.archive_file_id,80);
  const title = clean(input.title,300);
  if (!fileId || !title) return json({error:'ARCHIVE FILE AND TITLE ARE REQUIRED'},400);
  const files = await db.get(`archive_files?id=eq.${encodeURIComponent(fileId)}&select=id,code`);
  if (!files[0]) return json({error:'ARCHIVE FILE NOT FOUND'},404);

  const assignmentId = clean(input.assignment_id,80) || null;
  if (assignmentId) {
    const rows = await db.get(`archive_analyst_assignments?id=eq.${encodeURIComponent(assignmentId)}&archive_file_id=eq.${encodeURIComponent(fileId)}&select=id`);
    if (!rows[0]) return json({error:'ASSIGNMENT DOES NOT BELONG TO FILE'},400);
  }

  let material;
  try { material = input.source_url ? await fetchSource(input.source_url) : await fromInput(input); }
  catch (error) { return json({error:error.message || 'RESEARCH MATERIAL COULD NOT BE READ'},400); }
  if (!material.bytes.byteLength || material.bytes.byteLength > MAX_BYTES) return json({error:'RESEARCH FILE MUST BE BETWEEN 1 BYTE AND 5 MB'},413);
  if (!ALLOWED_TYPES.has(material.mimeType)) return json({error:'UNSUPPORTED RESEARCH FILE TYPE'},415);

  const hash = await sha256(material.bytes);
  const lineage = clean(input.lineage_key,180) || `research-${hash.slice(0,24)}`;
  const filename = safeFilename(material.filename || input.original_filename || `${title}.txt`);
  const path = `${fileId}/${crypto.randomUUID()}-${filename}`;
  const storage = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method:'POST',
    headers:{Authorization:auth,apikey:SUPABASE_KEY,'Content-Type':material.mimeType,'x-upsert':'false'},
    body:material.bytes
  });
  if (!storage.ok) {
    const detail = await safeError(storage);
    return json({error:'PRIVATE FILE STORAGE FAILED',detail},storage.status === 409 ? 409 : 502);
  }

  const isPdf = material.mimeType === 'application/pdf';
  try {
    const asset = (await db.post('archive_research_assets', {
      archive_file_id:fileId,
      assignment_id:assignmentId,
      intake_type:input.source_url ? 'URL' : input.file ? 'UPLOAD' : 'TEXT',
      title,
      original_filename:filename,
      mime_type:material.mimeType,
      storage_bucket:BUCKET,
      storage_path:path,
      source_url:input.source_url || null,
      citation_text:clean(input.citation_text,2000),
      extracted_text:isPdf ? '' : material.extractedText,
      content_sha256:hash,
      byte_size:material.bytes.byteLength,
      lineage_key:lineage,
      intake_status:isPdf ? 'PENDING EXTRACTION' : 'READY FOR REVIEW',
      extraction_status:isPdf ? 'PENDING' : 'COMPLETE',
      verification_status:'UNVERIFIED',
      imported_by:user.id
    }))[0];
    await db.post('archive_timeline', {
      archive_file_id:fileId,event_type:'research_asset_imported',detail:title,actor_id:user.id,
      metadata:{research_asset_id:asset.id,intake_type:asset.intake_type,lineage_key:lineage,extraction_status:asset.extraction_status}
    });
    return json({asset},201);
  } catch (error) {
    await deleteStored(auth,path).catch(()=>{});
    const duplicate = /duplicate|unique|409/i.test(String(error.message || error));
    return json({error:duplicate?'THIS RESEARCH FILE IS ALREADY ATTACHED':'RESEARCH ASSET RECORD FAILED'},duplicate?409:502);
  }
}

async function readInput(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    return {
      archive_file_id:form.get('archive_file_id'), assignment_id:form.get('assignment_id'), title:form.get('title'),
      source_url:form.get('source_url'), citation_text:form.get('citation_text'), lineage_key:form.get('lineage_key'),
      text_content:form.get('text_content'), original_filename:file?.name, file:file instanceof File ? file : null
    };
  }
  if (!type.includes('application/json')) throw new Error('CONTENT TYPE MUST BE JSON OR MULTIPART FORM DATA');
  const body = await request.json();
  return {...body,file:null};
}

function fromInput(input) {
  if (input.file) {
    const mimeType = normalizeMime(input.file.type, input.file.name);
    return input.file.arrayBuffer().then(buffer => {
      const bytes = new Uint8Array(buffer);
      return {bytes,mimeType,filename:input.file.name,extractedText:mimeType === 'application/pdf' ? '' : decode(bytes,mimeType)};
    });
  }
  const value = String(input.text_content || '').trim();
  if (!value) throw new Error('FILE, URL, OR TEXT CONTENT IS REQUIRED');
  const bytes = new TextEncoder().encode(value);
  return {bytes,mimeType:'text/plain',filename:input.original_filename || 'research-note.txt',extractedText:value};
}

async function fetchSource(value) {
  const url = validateUrl(value);
  const response = await fetch(url.toString(), {redirect:'manual',headers:{'User-Agent':'SID-Research-Intake/1.0','Accept':'text/plain,text/html,application/json,application/pdf;q=0.8'}});
  if (response.status >= 300 && response.status < 400) throw new Error('SOURCE REDIRECTS ARE NOT FOLLOWED; IMPORT THE FINAL HTTPS URL');
  if (!response.ok) throw new Error(`SOURCE FETCH FAILED (${response.status})`);
  const length = Number(response.headers.get('Content-Length') || 0);
  if (length > MAX_BYTES) throw new Error('REMOTE SOURCE EXCEEDS 5 MB');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error('REMOTE SOURCE EXCEEDS 5 MB');
  const mimeType = normalizeMime((response.headers.get('Content-Type') || '').split(';')[0],url.pathname);
  if (!ALLOWED_TYPES.has(mimeType)) throw new Error('REMOTE SOURCE TYPE IS NOT ALLOWED');
  const raw = mimeType === 'application/pdf' ? '' : decode(bytes,mimeType);
  const extractedText = mimeType === 'text/html' ? htmlText(raw) : raw;
  return {bytes,mimeType,filename:url.pathname.split('/').pop() || 'remote-source',extractedText};
}

function validateUrl(value) {
  let url; try { url = new URL(String(value)); } catch { throw new Error('VALID HTTPS SOURCE URL IS REQUIRED'); }
  if (url.protocol !== 'https:') throw new Error('ONLY HTTPS SOURCE URLS ARE ALLOWED');
  if (url.username || url.password || url.port) throw new Error('SOURCE URL CREDENTIALS AND CUSTOM PORTS ARE NOT ALLOWED');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || isPrivateIp(host)) throw new Error('PRIVATE OR LOCAL SOURCE URLS ARE NOT ALLOWED');
  return url;
}

function isPrivateIp(host) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  const [a,b] = host.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function normalizeMime(value,name='') {
  const mime = String(value || '').toLowerCase();
  if (ALLOWED_TYPES.has(mime)) return mime;
  const ext = String(name).toLowerCase().split('?')[0].split('.').pop();
  return ({txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json',html:'text/html',htm:'text/html',pdf:'application/pdf'})[ext] || 'application/octet-stream';
}

function decode(bytes,mime) {
  const text = new TextDecoder('utf-8',{fatal:false}).decode(bytes).replace(/\u0000/g,'').trim();
  if (!text) throw new Error(`NO TEXT COULD BE READ FROM ${mime}`);
  return text.slice(0,250000);
}

function htmlText(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim().slice(0,250000);
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function safeFilename(value) {
  const name = String(value || 'research.txt').split('/').pop().replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
  return name || 'research.txt';
}
function clean(value,max=500) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max); }

async function getUser(auth) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:auth,apikey:SUPABASE_KEY}});
  return response.ok ? response.json() : null;
}
function api(auth) {
  const headers = {Authorization:auth,apikey:SUPABASE_KEY,'Content-Type':'application/json'};
  async function call(path,options={}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers,...options.headers}});
    if (!response.ok) throw new Error(`${response.status} ${await safeError(response)}`);
    return response.status === 204 ? [] : response.json();
  }
  return {
    get:path=>call(path),
    post:(path,body)=>call(path,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)})
  };
}
async function deleteStored(auth,path) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',headers:{Authorization:auth,apikey:SUPABASE_KEY}});
}
async function safeError(response) { return clean(await response.text().catch(()=>''),500); }
function json(body,status=200) { return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}); }
