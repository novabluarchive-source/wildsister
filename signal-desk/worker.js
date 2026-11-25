// Standalone Signal Desk Worker. Deploy separately from Wild Sister.
const projects=['Wild Sister','Street Oracle','SID','SIT','Velvet Midnight','After Hours'];
const decisions=['Watch','Test','Adopt','Ignore'];
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function authorized(req,env){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL)return false;
 const token=req.headers.get('Cf-Access-Jwt-Assertion');if(!token)return false;
 try{
 const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
 const [h,p,s]=token.split('.');const header=JSON.parse(new TextDecoder().decode(decode(h))),claims=JSON.parse(new TextDecoder().decode(decode(p)));
 const issuer='https://'+env.ACCESS_TEAM_DOMAIN;
 if(header.alg!=='RS256'||claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD)||claims.exp<=Date.now()/1000||!Number.isFinite(claims.exp)||(claims.nbf&&claims.nbf>Date.now()/1000)||String(claims.email).toLowerCase()!==env.OWNER_EMAIL.toLowerCase())return false;
 const keys=await fetch(issuer+'/cdn-cgi/access/certs').then(r=>r.json());const jwk=keys.keys.find(k=>k.kid===header.kid);if(!jwk)return false;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(s),new TextEncoder().encode(h+'.'+p));
 }catch{return false}
}
export default {async fetch(req,env){
 if(!await authorized(req,env))return json({error:'Owner access required'},403);
 const url=new URL(req.url);
 if(url.pathname==='/')return new Response(page,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
 if(url.pathname!=='/api/records')return json({error:'Not found'},404);
 if(!env.DB)return json({error:'Storage not configured'},503);
 try{
 if(req.method==='GET'){const r=await env.DB.prepare('SELECT * FROM records ORDER BY created_at DESC').all();return json(r.results)}
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(req.headers.get('Origin')!==url.origin)return json({error:'Origin denied'},403);
 if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
 const raw=await req.text();if(raw.length>30000)return json({error:'Record too large'},413);
 const b=JSON.parse(raw);if(!['signal','assessment','action','review','decision'].includes(b.kind)||!String(b.title||'').trim()||String(b.title).length>250)return json({error:'Invalid record'},400);
 if(b.project&&!projects.includes(b.project))return json({error:'Invalid project'},400);
 if(b.decision&&!decisions.includes(b.decision))return json({error:'Invalid decision'},400);
 if(b.source){const u=new URL(b.source);if(!['https:','http:'].includes(u.protocol))return json({error:'Invalid source'},400)}
 const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO records(id,kind,title,project,payload) VALUES(?,?,?,?,?)').bind(id,b.kind,String(b.title),b.project||'',JSON.stringify(b)).run();return json({ok:true,id},201);
 }catch{return json({error:'Storage request failed'},500)}
}};
const page=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wild Sister Signal Desk</title><style>body{background:#090d15;color:#e5e7eb;font:16px system-ui;margin:0;padding:24px;max-width:1000px;margin:auto}h1{color:#e6c78b}small,label{color:#aab5c7}nav{display:flex;flex-wrap:wrap;gap:8px}button,input,select,textarea{font:inherit;background:#151d2b;color:#fff;border:1px solid #43516a;border-radius:6px;padding:10px}button{cursor:pointer}form,article{border:1px solid #344054;padding:16px;margin:16px 0;border-radius:10px}label{display:grid;gap:5px;margin:10px 0}textarea{min-height:80px}a{color:#9ed9ff}p{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>WILD SISTER // SIGNAL DESK</h1><small>PRIVATE OWNER INTELLIGENCE</small><nav id="nav"></nav><h2 id="heading"></h2><form id="form"><div id="fields"></div><button>Save record</button></form><p id="status" role="status"></p><section id="records"></section><script>
const projects=${JSON.stringify(projects)},decisions=${JSON.stringify(decisions)},tabs={signal:'Signal Log',assessment:'Compare Projects',action:'Action Queue',review:'Weekly Review',decision:'Decision History'};
let kind='signal',records=[];
const el=id=>document.getElementById(id);
function node(tag,text){const e=document.createElement(tag);e.textContent=text;return e}
function field(name,label,type='text',options=[]){const l=node('label',label),i=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');i.name=name;if(type==='select'){for(const v of [''].concat(options)){const o=node('option',v||'Select');o.value=v;i.append(o)}}else if(type!=='textarea')i.type=type;if(name==='title')i.required=true;l.append(i);el('fields').append(l)}
function show(k){kind=k;el('heading').textContent=tabs[k];el('fields').replaceChildren();field('title','Title');if(k!=='signal')field('project','Project','select',projects);if(k==='signal'){field('source','Original source URL','url');field('published','Publication date','date');field('effective','Effective date','date');field('pricing','Pricing or platform change');}else{field('signal_id','Related signal','select',records.filter(r=>r.kind==='signal').map(r=>r.id+' | '+r.title));}if(k==='assessment'||k==='review'||k==='decision')field('decision','Decision','select',decisions);if(k==='action'){field('due','Due date','date');field('criteria','Success criteria','textarea');field('outcome','Outcome','textarea')}field('notes','Rationale / notes','textarea');render()}
function render(){el('records').replaceChildren();for(const r of records.filter(r=>r.kind===kind)){const a=document.createElement('article');a.append(node('h3',r.title),node('small',r.project+' '+r.created_at));const b=JSON.parse(r.payload);for(const [k,v] of Object.entries(b)){if(v&&!['title','kind','project'].includes(k))a.append(node('p',k+': '+v))}el('records').append(a)}if(!el('records').children.length)el('records').append(node('p','No records yet.'))}
async function load(){const r=await fetch('/api/records');if(!r.ok)throw Error('Could not load records');records=await r.json();show(kind)}
for(const [k,v] of Object.entries(tabs)){const b=node('button',v);b.onclick=()=>show(k);el('nav').append(b)}
el('form').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.kind=kind;try{const r=await fetch('/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});if(!r.ok)throw Error('Save failed');el('status').textContent='Saved';await load()}catch(e){el('status').textContent=e.message}};
show(kind);load().catch(e=>el('status').textContent=e.message);
</script></html>`;
