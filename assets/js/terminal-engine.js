// ============================================================
// WILD SISTER // SID — Terminal Engine
// Terminal state, interface behavior, and workflow orchestration.
// ============================================================
(function (global) {
'use strict';



var agent=null,msgHistory=[],count=0,posting=false,sessionStart=null,selectedDivision=null,activeSystem='',caseData=null,currentSession=null,currentUserId=null,currentCaseId=null;


async function initializeDatabaseSession(){
  var chip=document.getElementById('authChip');
  var status=document.getElementById('dbStatus');

  try{
    if(!window.WildSisterAuth){
      throw new Error('AUTH MODULE NOT LOADED');
    }

    var access=await WildSisterAuth.getAccessState();

    currentSession=access.signedIn
      ? await WildSisterAuth.getSession()
      : null;

    currentUserId=access.user ? access.user.id : null;

    if(access.signedIn){
      chip.textContent=access.canUsePremium
        ? 'SESSION: MEMBER'
        : 'SESSION: VERIFIED';

      status.textContent=access.canUsePremium
        ? 'DATABASE: CONNECTED // MEMBER'
        : 'DATABASE: CONNECTED';

      status.className='db-status live';

      // Signed-in users can save cases even without an active paid plan.
      // Paid access controls premium actions, not basic case storage.
      try{sessionStorage.setItem('u','1');}catch(e){}
    }else{
      chip.textContent='SESSION: VISITOR';
      status.textContent='DATABASE: UNSAVED VISITOR MODE';
      status.className='db-status warn';
    }

    var params=new URLSearchParams(window.location.search);
    var requestedCase=params.get('case');

    if(requestedCase&&access.signedIn){
      await loadExistingCase(requestedCase);
    }
  }catch(error){
    console.error('Terminal authentication error:',error);

    currentSession=null;
    currentUserId=null;

    chip.textContent='SESSION: CHECK FAILED';
    status.textContent='DATABASE: AUTH CONNECTION ERROR';
    status.className='db-status warn';
  }
}

async function loadExistingCase(caseId){
  try{
    var bundle=await InvestigationEngine.loadCaseBundle(caseId);
    var c=bundle.case;
    var key=divisionKeyFromRecord(c);

    selectedDivision=key;
    agent=DIVISIONS[key].agent;
    activeSystem=DIVISIONS[key].system;
    currentCaseId=c.id;

    caseData={
      id:c.id,
      division:key,
      code:DIVISIONS[key].code,
      caseNum:c.case_number,
      subject:c.subject||'UNNAMED CASE',
      question:c.primary_question||'',
      evidence:bundle.evidence.map(function(e){return e.content;}).join('\n\n')||'NO ADDITIONAL EVIDENCE SUBMITTED',
      urgency:c.urgency||'STANDARD'
    };

    enterApp();
    document.getElementById('hall').style.display='none';
    await restoreSecureChannel(c,bundle.messages);
  }catch(error){
    console.error('Case load failed:',error);
    setDatabaseStatus('CASE LOAD FAILED: '+error.message,false);
  }
}

function divisionKeyFromRecord(c){
  var raw=String(c.lead_division||'').toUpperCase();
  if(raw.includes('BEHAVIOR'))return'BEHAVIORAL';
  if(raw.includes('ASTRO'))return'ASTROLOGY';
  if(raw.includes('ORIGINAL'))return'ORIGINALTEXT';
  if(raw.includes('NUMERIC'))return'NUMERIC';
  if(raw.includes('SYMBOL'))return'SYMBOL';
  return'PATTERN';
}

async function createCaseRecord(){
  if(!currentSession)return null;

  try{
    var d=DIVISIONS[selectedDivision];
    var record=await InvestigationEngine.createCase({
      case_number:caseData.caseNum,
      subject:caseData.subject,
      primary_question:caseData.question,
      urgency:caseData.urgency,
      lead_division:d.name,
      status:'active',
      current_finding:null
    });

    currentCaseId=record.id;
    caseData.id=record.id;

    await Promise.all([
      InvestigationEngine.saveEvidence(currentCaseId,{
        type:'initial_evidence',
        content:caseData.evidence
      }),
      InvestigationEngine.assignAnalyst(currentCaseId,{
        analyst:agent,
        role:'lead'
      }),
      InvestigationEngine.saveMessage(currentCaseId,{
        role:'user',
        analyst:'MEMBER',
        content:'CASE REQUEST\nSUBJECT: '+caseData.subject+
          '\nQUESTION: '+caseData.question+
          '\nEVIDENCE: '+caseData.evidence
      })
    ]);

    setDatabaseStatus('CASE SAVED // '+caseData.caseNum,true);
    return record;
  }catch(error){
    console.error('Case save failed:',error);
    setDatabaseStatus('CASE SAVE FAILED: '+error.message,false);
    return null;
  }
}

async function updateCase(fields){
  if(!currentCaseId||!currentSession)return;
  try{
    await InvestigationEngine.updateCase(currentCaseId,fields);
  }catch(error){
    console.error('Case update failed:',error);
    setDatabaseStatus('CASE UPDATE FAILED',false);
  }
}

async function saveCaseReport(analyst,reportType,content){
  if(!currentCaseId||!currentSession||!content)return;
  try{
    await InvestigationEngine.saveReport(currentCaseId,{
      analyst:analyst,
      reportType:reportType,
      content:content
    });
    setDatabaseStatus('REPORT FILED // '+analyst,true);
  }catch(error){
    console.error('Report save failed:',error);
    setDatabaseStatus('REPORT SAVE FAILED: '+error.message,false);
  }
}

async function saveCaseMessage(role,analystName,content){
  if(!currentCaseId||!currentSession||!content)return;
  try{
    await InvestigationEngine.saveMessage(currentCaseId,{
      analyst:analystName||agent||'SID',
      role:role,
      content:content
    });
  }catch(error){
    console.error('Message save failed:',error);
  }
}

async function assignCaseAnalyst(name,role){
  if(!currentCaseId||!currentSession)return;
  try{
    await InvestigationEngine.assignAnalyst(currentCaseId,{
      analyst:name,
      role:role
    });
  }catch(error){
    console.error('Analyst assignment failed:',error);
  }
}

async function logActivity(actor,action,fileCode,detail){
  // Disabled until institution_activity exists with secure RLS.
  return null;
}

function setDatabaseStatus(message,ok){
  var el=document.getElementById('dbStatus');
  if(!el)return;
  el.textContent=message;
  el.className='db-status '+(ok?'live':'warn');
}

async function restoreSecureChannel(record,prefetchedMessages){
  var d=DIVISIONS[selectedDivision];
  msgHistory=[];
  sessionStart=Date.now();

  document.getElementById('boot').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('caseassign').classList.remove('show');
  var cr=document.getElementById('chatroom');
  cr.style.display='flex';cr.style.flexDirection='column';cr.style.flex='1';
  document.getElementById('cname').textContent=d.name;
  document.getElementById('cname').style.color=d.color;
  document.getElementById('clabel').textContent=d.code+' // LEAD ANALYST: '+agent;
  document.getElementById('cbCase').textContent=caseData.caseNum;
  document.getElementById('cbUrgency').textContent=caseData.urgency;
  document.getElementById('cbAnalyst').textContent=agent;
  document.getElementById('cbStatus').textContent=String(record.status||'active').toUpperCase();
  document.getElementById('msgs').innerHTML='';

  var storedMessages=prefetchedMessages||await InvestigationEngine.getMessages(currentCaseId);

  storedMessages.forEach(function(m){
    if(m.role==='user')addMsg('user',m.content);
    else if(m.analyst==='NIX')addNixMsg(m.content);
    else if(m.analyst==='ASH')addAshMsg(m.content);
    else addNamedAnalystMsg(m.analyst||agent,m.content);
    msgHistory.push({role:m.role==='user'?'user':'assistant',content:m.content});
  });
}

function addNamedAnalystMsg(name,text){
  var oldAgent=agent;
  agent=name||oldAgent;
  addMsg('agent',text);
  agent=oldAgent;
}

function prepareEvidenceEntry(){
  var inp=document.getElementById('inp');
  inp.value='[EVIDENCE]\n';
  inp.focus();
  rsz(inp);
}

async function saveOperatorNote(){
  if(!currentCaseId||!currentSession){alert('Sign in and save the case first.');return;}
  var note=window.prompt('Add a private operator note:');
  if(!note)return;
  await InvestigationEngine.saveEvidence(currentCaseId,{
    type:'operator_note',
    content:note
  });
  addNamedAnalystMsg('OPERATOR','PRIVATE NOTE SAVED\n\n'+note);
}

function returnToDashboard(){
  window.location.href='dashboard/index.html'+(currentCaseId?'?case='+encodeURIComponent(currentCaseId):'');
}

function enterApp(){
  document.getElementById('boot').style.display='none';
  var a=document.getElementById('app');
  a.style.display='flex';
  a.style.flexDirection='column';
  a.style.height='100%';
}

// Deep-link support: terminal.html?division=BEHAVIORAL skips the
// boot screen entirely and drops straight into that division's
// case intake — used by divisions.html's OPEN INVESTIGATION
// buttons so choosing a division on that page actually means
// something here, not just a generic landing.
(function checkDivisionDeepLink(){
  var params = new URLSearchParams(window.location.search);
  var requested = params.get('division');
  if (requested && DIVISIONS[requested]) {
    document.addEventListener('DOMContentLoaded', function(){
      enterApp();
      openDivision(requested);
    });
  }
})();

function openDivision(key){
  selectedDivision=key;
  var d=DIVISIONS[key];
  document.getElementById('caseTitle').textContent=d.name;
  document.getElementById('caseTitle').style.color=d.color;
  document.getElementById('caseCode').textContent=d.code+' // NEW CASE';
  document.getElementById('caseCode').style.color=d.color;
  document.getElementById('caseCopy').textContent=d.copy;
  document.getElementById('assignName').textContent=d.agent;
  document.getElementById('assignName').style.color=COLORS[d.agent];
  document.getElementById('assignMeta').textContent='LEAD ANALYST // '+LABELS[d.agent]+'\nSUPPORT // '+d.support;
  document.getElementById('assignment').classList.add('show');
  document.getElementById('caseintake').classList.add('show');
  document.getElementById('caseSubject').focus();
}

function closeCaseIntake(){
  document.getElementById('caseintake').classList.remove('show');
}

async function beginCase(){
  if(!selectedDivision)return;

  var subject=document.getElementById('caseSubject').value.trim();
  var question=document.getElementById('caseQuestion').value.trim();
  var evidence=document.getElementById('caseEvidence').value.trim();
  var urgency=document.getElementById('caseUrgency').value;

  if(!question){
    document.getElementById('caseQuestion').style.borderColor='var(--lux)';
    document.getElementById('caseQuestion').focus();
    return;
  }

  var d=DIVISIONS[selectedDivision];
  agent=d.agent;
  activeSystem=d.system;

  var caseNum='SID-'+Date.now().toString(36).toUpperCase().slice(-6);

  caseData={
    division:selectedDivision,
    code:d.code,
    caseNum:caseNum,
    subject:subject||'UNNAMED CASE',
    question:question,
    evidence:evidence||'NO ADDITIONAL EVIDENCE SUBMITTED',
    urgency:urgency
  };

  document.getElementById('caseintake').classList.remove('show');

  if(currentSession){
    var saved=await createCaseRecord();
    if(!saved){
      var proceed=window.confirm('The case could not be saved. Continue in unsaved mode?');
      if(!proceed)return;
    }
  }else{
    setDatabaseStatus('VISITOR CASE // NOT SAVED',false);
  }

  runAnalysisSequence(d);
}

var DIV_ORDER=['BEHAVIORAL','ASTROLOGY','ORIGINALTEXT','NUMERIC','PATTERN','SYMBOL'];
var DIV_SHORT={BEHAVIORAL:'PSY',ASTROLOGY:'AST',ORIGINALTEXT:'OTF',NUMERIC:'NUM',PATTERN:'PAT',SYMBOL:'SYM'};

function runAnalysisSequence(d){
  var panel=document.getElementById('caseassign');
  var log=document.getElementById('scanLog');
  var reveal=document.getElementById('revealCard');
  log.innerHTML='';
  reveal.classList.remove('show');
  document.getElementById('assignCaseCode').textContent='FILE // '+caseData.caseNum;
  panel.classList.add('show');

  var steps=[
    {text:'RECEIVING CASE FILE '+caseData.caseNum,type:'line'},
    {text:'INDEXING SUBJECT: '+caseData.subject.toUpperCase(),type:'line'},
    {text:'CROSS-REFERENCING 6 DIVISIONS...',type:'bars'},
    {text:'DIVISION LOCKED: '+d.name,type:'line'},
    {text:'MATCHING LEAD ANALYST...',type:'line'},
    {text:'ANALYST CONFIRMED: '+agent,type:'line'}
  ];

  var i=0;
  function nextStep(){
    if(i>=steps.length){
      setTimeout(function(){showRevealCard(d);},400);
      return;
    }
    var s=steps[i];
    if(s.type==='bars'){
      addScanLine(s.text,false);
      setTimeout(function(){
        addMatchBars(d);
        i++;
        setTimeout(nextStep,1400);
      },300);
    } else {
      addScanLine(s.text,false);
      setTimeout(function(){
        markLastDone();
        i++;
        setTimeout(nextStep,260);
      },380);
    }
  }
  setTimeout(nextStep,300);
}

function addScanLine(text,done){
  var log=document.getElementById('scanLog');
  var row=document.createElement('div');
  row.className='scan-line';
  row.innerHTML='<span class="scan-check">'+(done?'✓':'›')+'</span><span>'+text+'<span class="scan-cursor"></span></span>';
  log.appendChild(row);
  log.scrollTop=log.scrollHeight;
  requestAnimationFrame(function(){row.classList.add('show');});
}

function markLastDone(){
  var lines=document.querySelectorAll('#scanLog .scan-line');
  if(!lines.length)return;
  var last=lines[lines.length-1];
  last.classList.add('done');
  var chk=last.querySelector('.scan-check');
  if(chk)chk.textContent='✓';
  var cur=last.querySelector('.scan-cursor');
  if(cur)cur.remove();
}

function addMatchBars(d){
  var log=document.getElementById('scanLog');
  var wrap=document.createElement('div');
  wrap.className='match-bars';
  DIV_ORDER.forEach(function(key){
    var isWinner=(key===selectedDivision);
    var pct=isWinner?(88+Math.floor(Math.random()*10)):(15+Math.floor(Math.random()*45));
    var row=document.createElement('div');
    row.className='match-row'+(isWinner?' winner':'');
    row.innerHTML='<div class="match-row-name">'+DIV_SHORT[key]+'</div><div class="match-row-track"><div class="match-row-fill"></div></div>';
    wrap.appendChild(row);
    setTimeout(function(){row.querySelector('.match-row-fill').style.width=pct+'%';},50);
  });
  log.appendChild(wrap);
  log.scrollTop=log.scrollHeight;
  setTimeout(markLastDone,650);
}

function showRevealCard(d){
  var reveal=document.getElementById('revealCard');
  document.getElementById('revealName').textContent=agent;
  document.getElementById('revealName').style.color=COLORS[agent];
  document.getElementById('revealRole').textContent=LABELS[agent]+' // '+d.code;
  document.getElementById('revealBrief').textContent=d.copy;
  reveal.classList.add('show');
}

function enterSecureChannel(){
  var d=DIVISIONS[selectedDivision];
  msgHistory=[];
  try{count=parseInt(sessionStorage.getItem('msgCount')||'0');}catch(e){count=0;}
  sessionStart=Date.now();
  document.getElementById('pw').classList.remove('show');
  document.getElementById('caseassign').classList.remove('show');
  document.getElementById('hall').style.display='none';
  var cr=document.getElementById('chatroom');
  cr.style.display='flex';cr.style.flexDirection='column';cr.style.flex='1';
  document.getElementById('cname').textContent=d.name;
  document.getElementById('cname').style.color=d.color;
  document.getElementById('clabel').textContent=d.code+' // LEAD ANALYST: '+agent;
  document.getElementById('cbCase').textContent=caseData.caseNum;
  document.getElementById('cbUrgency').textContent=caseData.urgency;
  document.getElementById('cbAnalyst').textContent=agent;
  document.getElementById('msgs').innerHTML='';
  var opening='CASE OPENED // '+d.code+'\n\nSUBJECT: '+caseData.subject+'\nURGENCY: '+caseData.urgency+'\nLEAD ANALYST: '+agent+'\n\nPRIMARY QUESTION:\n'+caseData.question+'\n\nKNOWN EVIDENCE:\n'+caseData.evidence+'\n\nInvestigation active. Reviewing the record now.';
  addMsg('agent',opening);
  msgHistory.push({role:'user',content:'CASE REQUEST\nDivision: '+d.name+'\nSubject: '+caseData.subject+'\nUrgency: '+caseData.urgency+'\nPrimary question: '+caseData.question+'\nKnown evidence: '+caseData.evidence});
  showThinking();
  posting=true;
  document.getElementById('sbtn').disabled=true;
  fetch(W,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:350,system:activeSystem,messages:msgHistory})})
    .then(function(r){return r.json();})
    .then(function(data){
      clearThinking();
      var reply=data.content&&data.content[0]?data.content[0].text:'['+agent+'] Signal interrupted. Add one more piece of evidence and try again.';
      addMsg('agent',reply);msgHistory.push({role:'assistant',content:reply});
      saveCaseMessage('assistant',agent,reply);
      saveCaseReport(agent,'initial_assessment',reply);
      updateCase({current_finding:reply.slice(0,1000)});
    }).catch(function(){clearThinking();addMsg('agent','['+agent+']\n\nSignal interruption. Your case is still open. Send the question once more.');})
    .finally(function(){posting=false;document.getElementById('sbtn').disabled=false;document.getElementById('inp').focus();});
}

function addNixMsg(text){
  var msgs=document.getElementById('msgs');
  var d=document.createElement('div');
  d.className='msg mag';
  var lbl=document.createElement('div');
  lbl.className='mlbl';
  lbl.textContent='NIX // CROSS-SYSTEM SYNTHESIS';
  lbl.style.color=COLORS.NIX;
  var body=document.createElement('div');
  body.className='mbod';
  body.style.borderLeftColor=COLORS.NIX;
  body.textContent=text;
  d.appendChild(lbl);d.appendChild(body);
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}

function requestCrossSynthesis(){
  if(!agent||!caseData||posting)return;
  var chip=document.getElementById('cbSynth');
  if(chip.dataset.state==='done'||chip.dataset.state==='pending')return;
  chip.dataset.state='pending';
  chip.textContent='COMPARING...';
  chip.style.color='var(--muted)';
  document.getElementById('cbSynthChip').style.cursor='default';
  posting=true;
  document.getElementById('sbtn').disabled=true;
  showThinking('NIX');
  var transcript=buildCaseTranscript();
  fetch(W,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:280,system:NIX_SYSTEM,messages:[{role:'user',content:transcript}]})})
    .then(function(r){return r.json();})
    .then(function(data){
      clearThinking();
      var reply=data.content&&data.content[0]?data.content[0].text:'NIX synthesis interrupted. Try again.';
      addNixMsg(reply);
      saveCaseMessage('assistant','NIX',reply);
      assignCaseAnalyst('NIX','synthesis');
      saveCaseReport('NIX','cross_system_synthesis',reply);
      updateCase({current_finding:reply});
      logActivity('NIX','filed synthesis',caseData.caseNum,caseData.subject);
      chip.dataset.state='done';
      chip.textContent='NIX ✓';
      chip.style.color='var(--cipher)';
    })
    .catch(function(){
      clearThinking();
      addNixMsg('Signal interrupted. Synthesis not complete. Try again.');
      chip.dataset.state='';
      chip.textContent='REQUEST →';
      chip.style.color='var(--cipher)';
      document.getElementById('cbSynthChip').style.cursor='pointer';
    })
    .finally(function(){posting=false;document.getElementById('sbtn').disabled=false;});
}

function buildCaseTranscript(){
  var d=DIVISIONS[selectedDivision];
  var lines=['CASE '+caseData.caseNum+' — '+d.name+' — LEAD ANALYST: '+agent,'SUBJECT: '+caseData.subject,'URGENCY: '+caseData.urgency,''];
  msgHistory.forEach(function(m){
    lines.push((m.role==='user'?'PERSON: ':'ANALYST ('+agent+'): ')+m.content);
  });
  return lines.join('\n\n');
}

function addAshMsg(text){
  var msgs=document.getElementById('msgs');
  var d=document.createElement('div');
  d.className='msg mag';
  var lbl=document.createElement('div');
  lbl.className='mlbl';
  lbl.textContent='ASH // FINAL ASSESSMENT';
  lbl.style.color=COLORS.ASH;
  var body=document.createElement('div');
  body.className='mbod';
  body.style.borderLeftColor=COLORS.ASH;
  body.style.textTransform='uppercase';
  body.textContent=text;
  d.appendChild(lbl);d.appendChild(body);
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}

function requestFinalAssessment(){
  if(!agent||!caseData||posting)return;
  var chip=document.getElementById('cbReview');
  if(chip.dataset.state==='closed'||chip.dataset.state==='pending')return;
  chip.dataset.state='pending';
  chip.textContent='REVIEWING...';
  chip.style.color='var(--muted)';
  document.getElementById('cbReviewChip').style.cursor='default';
  posting=true;
  document.getElementById('sbtn').disabled=true;
  showThinking('ASH');
  var transcript=buildCaseTranscript();
  fetch(W,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:280,system:ASH_SYSTEM,messages:[{role:'user',content:transcript}]})})
    .then(function(r){return r.json();})
    .then(function(data){
      clearThinking();
      var reply=data.content&&data.content[0]?data.content[0].text:'ASH REVIEW INTERRUPTED. TRY AGAIN.';
      addAshMsg(reply);
      saveCaseMessage('assistant','ASH',reply);
      assignCaseAnalyst('ASH','final_assessment');
      saveCaseReport('ASH','final_assessment',reply);
      updateCase({status:'closed',current_finding:reply});
      logActivity('ASH','closed case',caseData.caseNum,caseData.subject);
      chip.dataset.state='closed';
      chip.textContent='ASH ✓';
      chip.style.color='var(--cyan)';
      var statusEl=document.getElementById('cbStatus');
      statusEl.textContent='CLOSED';
      statusEl.classList.remove('live');
    })
    .catch(function(){
      clearThinking();
      addAshMsg('SIGNAL INTERRUPTED. REVIEW NOT COMPLETE. TRY AGAIN.');
      chip.dataset.state='';
      chip.textContent='REQUEST →';
      chip.style.color='var(--violet)';
      document.getElementById('cbReviewChip').style.cursor='pointer';
    })
    .finally(function(){posting=false;document.getElementById('sbtn').disabled=false;});
}

function backToHall(){
  document.getElementById('chatroom').style.display='none';
  document.getElementById('caseassign').classList.remove('show');
  document.getElementById('hall').style.display='flex';
  agent=null;msgHistory=[];sessionStart=null;selectedDivision=null;activeSystem='';caseData=null;currentCaseId=null;
  document.getElementById('caseSubject').value='';
  document.getElementById('caseQuestion').value='';
  document.getElementById('caseEvidence').value='';
  var synthChip=document.getElementById('cbSynth');
  synthChip.dataset.state='';
  synthChip.textContent='REQUEST →';
  synthChip.style.color='var(--cipher)';
  document.getElementById('cbSynthChip').style.cursor='pointer';
  var chip=document.getElementById('cbReview');
  chip.dataset.state='';
  chip.textContent='REQUEST →';
  chip.style.color='var(--violet)';
  document.getElementById('cbReviewChip').style.cursor='pointer';
  var statusEl=document.getElementById('cbStatus');
  statusEl.textContent='ACTIVE';
  statusEl.classList.add('live');
}



function unlock(){
  try{sessionStorage.setItem('u','1')}catch(e){}
  document.getElementById('pw').classList.remove('show');
}

function isUnlocked(){
  try{return sessionStorage.getItem('u')==='1'}catch(e){return false}
}

function addMsg(type,text){
  var msgs=document.getElementById('msgs');
  var d=document.createElement('div');
  d.className='msg '+(type==='agent'?'mag':'mme');
  var lbl=document.createElement('div');
  lbl.className='mlbl';
  lbl.textContent=type==='agent'?agent:'YOU';
  if(type==='agent'&&agent)lbl.style.color=COLORS[agent];
  var body=document.createElement('div');
  body.className='mbod';
  if(type==='agent'&&agent)body.style.borderLeftColor=COLORS[agent];
  body.textContent=text;
  d.appendChild(lbl);d.appendChild(body);
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}

function showThinking(label){
  var msgs=document.getElementById('msgs');
  var d=document.createElement('div');
  d.className='thnk';d.id='thnk';
  d.textContent=(label||agent)+' // processing...';
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}

function clearThinking(){var t=document.getElementById('thnk');if(t)t.remove();}

// ------------------------------------------------------------
// LUX-only: real source retrieval before generating a response.
// Without this, LUX's Source/Key Word/Observation format would
// just be formatting around a guess — this is what makes the
// Observation actually about something real.
// ------------------------------------------------------------
function detectScriptureRef(text){
  var m = text.match(/\b([1-3]?\s?[A-Za-z]+\.?\s+\d{1,3}:\d{1,3}(-\d{1,3})?)\b/);
  return m ? m[1].replace(/\s+/g,' ').trim() : null;
}

async function lookupScripture(ref){
  try{
    var res = await fetch('/api/bible-lookup?ref='+encodeURIComponent(ref));
    if(!res.ok) return null;
    return await res.json();
  } catch(e){
    return null;
  }
}

async function send(){
  if(posting||!agent)return;
  var inp=document.getElementById('inp');
  var text=inp.value.trim();
  if(!text)return;
  posting=true;
  document.getElementById('sbtn').disabled=true;
  inp.value='';inp.style.height='auto';
  addMsg('user',text);
  msgHistory.push({role:'user',content:text});
  saveCaseMessage('user','MEMBER',text);
  if(text.indexOf('[EVIDENCE]')===0&&currentSession&&currentCaseId){
    InvestigationEngine.saveEvidence(currentCaseId,{
      type:'submitted_evidence',
      content:text.replace(/^\[EVIDENCE\]\s*/,'')
    }).catch(function(error){
      console.error('Evidence save failed:',error);
    });
  }
  count++;
  try{sessionStorage.setItem('msgCount',count);}catch(e){}
  if(!currentSession&&!isUnlocked()&&count>FREE){
    document.getElementById('pw').classList.add('show');
    posting=false;
    document.getElementById('sbtn').disabled=false;
    return;
  }
  if(!currentSession&&isUnlocked()&&count>15){
    addMsg('agent','['+agent+']\n\nSession complete. You have reached the limit for this channel.\n\nYour full read is waiting at wildsister.co/order.html');
    posting=false;
    document.getElementById('sbtn').disabled=true;
    document.getElementById('inp').disabled=true;
    return;
  }

  if(agent==='LUX'){
    var ref=detectScriptureRef(text);
    if(ref){
      showThinking('LUX // retrieving source text');
      var lookup=await lookupScripture(ref);
      clearThinking();
      var lastMsg=msgHistory[msgHistory.length-1];
      if(lookup && (lookup.translations||[]).length){
        var sourceBlock='\n\n[RETRIEVED SOURCE TEXT — '+lookup.ref+']\n';
        lookup.translations.forEach(function(t){
          sourceBlock+=t.name+': "'+t.text+'"\n';
        });
        sourceBlock+= lookup.original_language
          ? lookup.original_language.versionTitle+' (Hebrew): "'+lookup.original_language.text+'"\n'
          : '(No original-language Hebrew text available for this reference — likely New Testament or reference not found in the Hebrew source. Say so rather than inventing Greek text.)\n';
        lastMsg.content = text + sourceBlock;
      } else {
        lastMsg.content = text + '\n\n[No source text could be retrieved for "'+ref+'" — say so plainly rather than answering as if you have it.]';
      }
    }
  }

  showThinking();
  fetch(W,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:300,system:activeSystem,messages:msgHistory})
  }).then(function(r){return r.json();}).then(function(data){
    clearThinking();
    var reply=data.content&&data.content[0]?data.content[0].text:'['+agent+'] Signal interrupted. Try again.';
    addMsg('agent',reply);
    msgHistory.push({role:'assistant',content:reply});
    saveCaseMessage('assistant',agent,reply);
    saveCaseReport(agent,'case_log',reply);
    updateCase({current_finding:reply.slice(0,1000)});
  }).catch(function(){
    clearThinking();
    addMsg('agent','['+agent+']\n\nLost the signal for a second. Send that again.');
  }).finally(function(){
    posting=false;
    document.getElementById('sbtn').disabled=false;
    inp.focus();
  });
}

function validateCode(){
  var VALID_CODES=['wsread2026','wssun2026','wsast2026','wsshadow2026','wsreturn2026','wssignal2026'];
  var inp=document.getElementById('accessCodeInp');
  var code=inp.value.trim().toLowerCase();
  if(VALID_CODES.indexOf(code)>-1){
    unlock();
    document.getElementById('pw').classList.remove('show');
    try{sessionStorage.setItem('msgCount','3');}catch(e){}
    count=3;
  } else {
    document.getElementById('codeError').style.display='block';
    inp.style.borderColor='var(--lux)';
  }
}

function onKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}
function rsz(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,80)+'px';}

initializeDatabaseSession();

})(window);
