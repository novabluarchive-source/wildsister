(() => {
"use strict";

let currentUser = null;
let currentCases = [];
let selectedCaseId = null;

const byId = (id) => document.getElementById(id);

function escapeHtml(value){
    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function showDashboard(){
    const loading = byId("loadingGate");
    const dashboard = byId("dashboardContent");

    if(loading) loading.style.display="none";
    if(dashboard) dashboard.style.display="block";
}

function showDashboardError(message){

    console.error(message);

    showDashboard();

    const error = byId("errorNote");

    if(error){
        error.innerHTML=`
        <div class="empty-board">
            <div class="empty-board-title">
                SYSTEM ERROR
            </div>

            <p>${escapeHtml(message)}</p>

        </div>`;
    }

}

function formatDate(date){

    if(!date) return "UNKNOWN";

    const d=new Date(date);

    if(isNaN(d)) return date;

    return d.toLocaleDateString("en-US",{
        year:"numeric",
        month:"short",
        day:"2-digit"
    });

}

function formatCaseCode(c){

    return (
        c.case_number ||
        c.case_code ||
        c.code ||
        `CASE-${String(c.id).slice(0,8).toUpperCase()}`
    );

}

function caseStatus(c){
    return String(c.status || "active").toLowerCase();
}
  function updateHeader(){

    const date=byId("currentDate");
    const operator=byId("operatorName");
    const clearance=byId("navClearance");

    if(date){

        date.textContent=new Date().toLocaleDateString("en-US",{

            year:"numeric",
            month:"short",
            day:"2-digit"

        });

    }

    if(operator){

        operator.textContent=(
            currentUser?.user_metadata?.full_name ||
            currentUser?.email ||
            "MEMBER"
        ).toUpperCase();

    }

    if(clearance){

        clearance.textContent=currentUser
            ? "VERIFIED"
            : "VISITOR";

    }

}

function updateStats(){

    const active=currentCases.filter(
        x=>caseStatus(x)==="active"
    ).length;

    const closed=currentCases.filter(
        x=>caseStatus(x)==="closed"
    ).length;

    if(byId("statActive"))
        byId("statActive").textContent=String(active).padStart(2,"0");

    if(byId("statClosed"))
        byId("statClosed").textContent=String(closed).padStart(2,"0");

    if(byId("statArchive"))
        byId("statArchive").textContent=String(currentCases.length).padStart(2,"0");

}
  function renderCases(cases = currentCases) {

    const grid = byId("caseGrid");

    if (!grid) return;

    if (!cases.length) {

        grid.innerHTML = `
        <div class="empty-board">

            <div class="empty-board-title">
                NO CASE FILES FOUND
            </div>

            <p>Open a new investigation to create your first case.</p>

            <a href="../terminal.html">
                OPEN TERMINAL →
            </a>

        </div>
        `;

        return;

    }

    grid.innerHTML = cases.map(caseItem => {

        const id = escapeHtml(caseItem.id);

        const code = escapeHtml(formatCaseCode(caseItem));

        const title = escapeHtml(

            caseItem.title ||

            caseItem.subject ||

            caseItem.question ||

            "Untitled Investigation"

        );

        const division = escapeHtml(

            caseItem.division ||

            caseItem.assigned_division ||

            "UNASSIGNED"

        );

        const status = caseStatus(caseItem);

        const created = formatDate(

            caseItem.created_at ||

            caseItem.updated_at

        );

        return `

        <button

            class="case-file-card ${selectedCaseId==caseItem.id?"selected":""}"

            data-id="${id}"

        >

            <span class="case-pin"></span>

            <span class="case-code">${code}</span>

            <strong>${title}</strong>

            <span class="case-detail">${division}</span>

            <span class="case-detail">

                OPENED ${created}

            </span>

            <span class="case-status ${status}">

                ${status.toUpperCase()}

            </span>

        </button>

        `;

    }).join("");



    grid.querySelectorAll(".case-file-card")

    .forEach(card=>{

        card.onclick=()=>{

            selectDashboardCase(

                card.dataset.id

            );

        };

    });

}



function filterCases(){

    const search=(

        byId("caseSearchInput")?.value ||

        ""

    ).toLowerCase();



    if(!search){

        renderCases(currentCases);

        return;

    }



    const filtered=currentCases.filter(c=>{

        return (

            formatCaseCode(c)+

            " "+

            (c.title||"")+

            " "+

            (c.subject||"")+

            " "+

            (c.question||"")

        )

        .toLowerCase()

        .includes(search);

    });



    renderCases(filtered);

}



function clearCaseSearch(){

    const input=byId("caseSearchInput");

    if(input)

        input.value="";



    renderCases(currentCases);

}



function toggleCaseSearch(){

    byId("caseSearchBar")

        ?.classList.toggle("show");



    byId("caseSearchInput")

        ?.focus();

}
  async function selectDashboardCase(caseId){

    selectedCaseId = caseId;

    renderCases();

    const selected = currentCases.find(
        c => String(c.id) === String(caseId)
    );

    if(!selected) return;

    const continueBtn = byId("continueCaseBtn");
    const refreshBtn = byId("refreshCaseBtn");
    const reportBtn = byId("prepareReportBtn");

    if(continueBtn){
        continueBtn.href =
            "../terminal.html?case=" +
            encodeURIComponent(caseId);
    }

    if(refreshBtn) refreshBtn.disabled = false;
    if(reportBtn) reportBtn.disabled = false;

    try{

        let bundle = {
            evidence:[],
            reports:[],
            analysts:[],
            messages:[]
        };

        if(window.InvestigationEngine &&
           typeof InvestigationEngine.loadCaseBundle==="function"){

            bundle =
                await InvestigationEngine.loadCaseBundle(caseId);

        }

        renderCaseWall(selected,bundle);

        renderFeed(bundle);

    }catch(err){

        console.error(err);

        renderCaseWall(selected,{
            evidence:[],
            reports:[],
            analysts:[],
            messages:[]
        });

        renderFeed({});

    }

}



function renderCaseWall(caseItem,bundle){

    bundle = bundle || {};

    const evidence = bundle.evidence || [];

    const reports = bundle.reports || [];

    const analysts = bundle.analysts || [];

    const latestEvidence = evidence[0] || {};

    const latestReport = reports[0] || {};



    if(byId("wallHeader"))

        byId("wallHeader").textContent =
            "CASE WALL // " +
            formatCaseCode(caseItem);



    if(byId("boardQuestion"))

        byId("boardQuestion").textContent =
            caseItem.question ||
            caseItem.subject ||
            caseItem.title ||
            "No question submitted.";



    if(byId("boardBirthData"))

        byId("boardBirthData").textContent =
            caseItem.birth_data ||
            caseItem.birth_details ||
            "No birth data.";



    if(byId("boardEvidence"))

        byId("boardEvidence").textContent =
            latestEvidence.content ||
            latestEvidence.summary ||
            latestEvidence.evidence ||
            "No evidence filed.";



    if(byId("boardTheme"))

        byId("boardTheme").textContent =
            latestReport.theme ||
            caseItem.theme ||
            "Theme pending.";



    if(byId("boardSynthesis"))

        byId("boardSynthesis").textContent =
            latestReport.content ||
            latestReport.summary ||
            "No synthesis yet.";



    if(byId("boardPattern"))

        byId("boardPattern").textContent =
            latestReport.key_pattern ||
            caseItem.key_pattern ||
            "No confirmed pattern.";



    if(byId("boardChartText")){

        const analystNames = analysts

            .map(a =>
                a.analyst_name ||
                a.analyst ||
                a.name
            )

            .filter(Boolean);

        byId("boardChartText").textContent =

            evidence.length +
            " evidence item(s)\n" +

            reports.length +
            " report(s)\n" +

            (
                analystNames.length
                ? analystNames.join(", ")
                : "No analysts assigned."
            );

    }

    renderEvidenceFolders(evidence);

}



function renderEvidenceFolders(evidence){

    const holder = byId("evidenceFolders");

    if(!holder) return;

    if(!evidence.length){

        holder.innerHTML=`

        <div class="folder">

            <small>EVIDENCE FILE</small>

            No evidence filed.

        </div>

        `;

        return;

    }



    holder.innerHTML = evidence

        .slice(0,6)

        .map((item,index)=>`

            <div class="folder">

                <small>

                    EVIDENCE FILE ${String(index+1).padStart(2,"0")}

                </small>

                ${escapeHtml(

                    item.title ||

                    item.evidence_type ||

                    item.type ||

                    "Evidence"

                )}

            </div>

        `)

        .join("");

}



function renderFeed(bundle){

    const feed = byId("institutionFeed");

    if(!feed) return;

    bundle = bundle || {};

    const activity = [

        ...(bundle.messages||[]).map(m=>({

            label:"MESSAGE FILED",

            text:m.content||m.message||"New message"

        })),



        ...(bundle.reports||[]).map(r=>({

            label:"REPORT FILED",

            text:r.title||r.summary||"New report"

        })),



        ...(bundle.evidence||[]).map(e=>({

            label:"EVIDENCE FILED",

            text:e.title||e.summary||"New evidence"

        }))

    ];



    if(!activity.length){

        feed.innerHTML=`

        <div class="feed-item">

            <strong>NO ACTIVITY</strong>

        </div>

        `;

        return;

    }



    feed.innerHTML = activity

        .slice(0,10)

        .map(item=>`

        <div class="feed-item">

            <strong>${escapeHtml(item.label)}</strong>

            <div>${escapeHtml(item.text)}</div>

        </div>

        `)

        .join("");

}
  async function resolveCurrentUser(){

    try{

        if(
            window.WildSisterAuth &&
            typeof window.WildSisterAuth.getCurrentUser === "function"
        ){

            currentUser =
                await window.WildSisterAuth.getCurrentUser();

            return;

        }

        const client =
            window.supabaseClient ||
            window.wildSisterSupabase;

        if(
            client &&
            client.auth &&
            typeof client.auth.getUser === "function"
        ){

            const result =
                await client.auth.getUser();

            currentUser =
                result?.data?.user || null;

        }

    }catch(error){

        console.warn(
            "Unable to resolve current user:",
            error
        );

        currentUser = null;

    }

}



async function loadCases(){

    try{

        let result = [];

        if(
            window.InvestigationEngine &&
            typeof InvestigationEngine.getCases === "function"
        ){

            result =
                await InvestigationEngine.getCases();

        }else if(
            window.InvestigationEngine &&
            typeof InvestigationEngine.loadCases === "function"
        ){

            result =
                await InvestigationEngine.loadCases();

        }

        currentCases =
            Array.isArray(result)
                ? result
                : [];

    }catch(error){

        console.error(
            "Unable to load cases:",
            error
        );

        currentCases = [];

    }

    updateStats();

    renderCases();

}



function handleOpenNewCase(){

    window.location.href =
        "../terminal.html";

}



async function refreshSelectedCase(){

    if(!selectedCaseId) return;

    await selectDashboardCase(
        selectedCaseId
    );

}



function prepareReport(){

    if(!selectedCaseId) return;

    window.location.href =

        "../terminal.html?case=" +

        encodeURIComponent(selectedCaseId) +

        "&action=report";

}



async function syncOperations(){

    const status =
        byId("systemStatus");

    if(status)

        status.textContent =
            "SYNCING";



    await loadCases();



    if(selectedCaseId){

        await selectDashboardCase(
            selectedCaseId
        );

    }



    if(status)

        status.textContent =
            "ACTIVE";

}



async function initializeDashboard(){

    try{

        await resolveCurrentUser();

        updateHeader();

        await loadCases();

        renderFeed({});

        showDashboard();

    }catch(error){

        showDashboardError(

            error?.message ||

            "Dashboard initialization failed."

        );

    }

}



window.handleOpenNewCase =
    handleOpenNewCase;

window.toggleCaseSearch =
    toggleCaseSearch;

window.filterCases =
    filterCases;

window.clearCaseSearch =
    clearCaseSearch;

window.selectDashboardCase =
    selectDashboardCase;

window.refreshSelectedCase =
    refreshSelectedCase;

window.prepareReport =
    prepareReport;

window.syncOperations =
    syncOperations;



if(document.readyState === "loading"){

    document.addEventListener(

        "DOMContentLoaded",

        initializeDashboard

    );

}else{

    initializeDashboard();

}

})();
