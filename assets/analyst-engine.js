// ============================================================
// WILD SISTER // SID — TERMINAL ENGINE
// Terminal UI and investigation workflow.
// ============================================================

(function (global) {
  "use strict";

  const FREE = 3;

  let agent = null;
  let msgHistory = [];
  let count = 0;
  let posting = false;
  let selectedDivision = null;
  let activeSystem = "";
  let caseData = null;
  let currentSession = null;
  let currentUserId = null;
  let currentCaseId = null;

  const DIV_ORDER = [
    "BEHAVIORAL",
    "ASTROLOGY",
    "ORIGINALTEXT",
    "NUMERIC",
    "PATTERN",
    "SYMBOL"
  ];

  const DIV_SHORT = {
    BEHAVIORAL: "PSY",
    ASTROLOGY: "AST",
    ORIGINALTEXT: "OTF",
    NUMERIC: "NUM",
    PATTERN: "PAT",
    SYMBOL: "SYM"
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setDatabaseStatus(message, ok) {
    const el = byId("dbStatus");
    if (!el) return;

    el.textContent = message;
    el.className =
      "db-status " + (ok ? "live" : "warn");
  }

  async function initializeDatabaseSession() {
    const chip = byId("authChip");

    try {
      if (!global.WildSisterAuth) {
        throw new Error("AUTH_MODULE_NOT_LOADED");
      }

      const access =
        await WildSisterAuth.getAccessState();

      currentSession = access.signedIn
        ? await WildSisterAuth.getSession()
        : null;

      currentUserId =
        access.user ? access.user.id : null;

      if (access.signedIn) {
        chip.textContent = access.canUsePremium
          ? "SESSION: MEMBER"
          : "SESSION: VERIFIED";

        setDatabaseStatus(
          access.canUsePremium
            ? "DATABASE: CONNECTED // MEMBER"
            : "DATABASE: CONNECTED",
          true
        );

        try {
          sessionStorage.setItem("u", "1");
        } catch (error) {}
      } else {
        chip.textContent = "SESSION: VISITOR";
        setDatabaseStatus(
          "DATABASE: UNSAVED VISITOR MODE",
          false
        );
      }

      const params =
        new URLSearchParams(
          window.location.search
        );

      const requestedCase =
        params.get("case");

      if (
        requestedCase &&
        access.signedIn
      ) {
        await loadExistingCase(requestedCase);
      }
    } catch (error) {
      console.error(
        "Terminal authentication error:",
        error
      );

      chip.textContent =
        "SESSION: CHECK FAILED";

      setDatabaseStatus(
        "DATABASE: AUTH CONNECTION ERROR",
        false
      );
    }
  }

  function divisionKeyFromRecord(record) {
    const raw = String(
      record.lead_division || ""
    ).toUpperCase();

    if (raw.includes("BEHAVIOR")) {
      return "BEHAVIORAL";
    }

    if (raw.includes("ASTRO")) {
      return "ASTROLOGY";
    }

    if (raw.includes("ORIGINAL")) {
      return "ORIGINALTEXT";
    }

    if (raw.includes("NUMERIC")) {
      return "NUMERIC";
    }

    if (raw.includes("SYMBOL")) {
      return "SYMBOL";
    }

    return "PATTERN";
  }

  async function loadExistingCase(caseId) {
    try {
      const bundle =
        await InvestigationEngine.loadCaseBundle(
          caseId
        );

      const record = bundle.case;
      const key =
        divisionKeyFromRecord(record);

      selectedDivision = key;
      agent = DIVISIONS[key].agent;
      activeSystem =
        DIVISIONS[key].system;
      currentCaseId = record.id;

      caseData = {
        id: record.id,
        division: key,
        code: DIVISIONS[key].code,
        caseNum: record.case_number,
        subject:
          record.subject ||
          "UNNAMED CASE",
        question:
          record.primary_question || "",
        evidence:
          bundle.evidence
            .map(function (item) {
              return item.content;
            })
            .join("\n\n") ||
          "NO ADDITIONAL EVIDENCE SUBMITTED",
        urgency:
          record.urgency || "STANDARD"
      };

      enterApp();
      byId("hall").style.display = "none";

      await restoreSecureChannel(
        record,
        bundle.messages
      );
    } catch (error) {
      console.error(
        "Case load failed:",
        error
      );

      setDatabaseStatus(
        "CASE LOAD FAILED: " +
          error.message,
        false
      );
    }
  }

  function enterApp() {
    byId("boot").style.display = "none";

    const app = byId("app");

    app.style.display = "flex";
    app.style.flexDirection = "column";
    app.style.height = "100%";
  }

  function openDivision(key) {
    selectedDivision = key;

    const division = DIVISIONS[key];

    byId("caseTitle").textContent =
      division.name;

    byId("caseTitle").style.color =
      division.color;

    byId("caseCode").textContent =
      division.code + " // NEW CASE";

    byId("caseCode").style.color =
      division.color;

    byId("caseCopy").textContent =
      division.copy;

    byId("assignName").textContent =
      division.agent;

    byId("assignName").style.color =
      COLORS[division.agent];

    byId("assignMeta").textContent =
      "LEAD ANALYST // " +
      LABELS[division.agent] +
      "\nSUPPORT // " +
      division.support;

    byId("assignment").classList.add(
      "show"
    );

    byId("caseintake").classList.add(
      "show"
    );

    byId("caseSubject").focus();
  }

  function closeCaseIntake() {
    byId("caseintake").classList.remove(
      "show"
    );
  }

  async function createCaseRecord() {
    if (!currentSession) return null;

    try {
      const division =
        DIVISIONS[selectedDivision];

      const record =
        await InvestigationEngine.createCase({
          case_number:
            caseData.caseNum,
          subject:
            caseData.subject,
          primary_question:
            caseData.question,
          urgency:
            caseData.urgency,
          lead_division:
            division.name,
          status: "active",
          current_finding: null
        });

      currentCaseId = record.id;
      caseData.id = record.id;

      await Promise.all([
        InvestigationEngine.saveEvidence(
          currentCaseId,
          {
            type: "initial_evidence",
            content:
              caseData.evidence
          }
        ),

        InvestigationEngine.assignAnalyst(
          currentCaseId,
          {
            analyst: agent,
            role: "lead"
          }
        ),

        InvestigationEngine.saveMessage(
          currentCaseId,
          {
            analyst: "MEMBER",
            role: "user",
            content:
              "CASE REQUEST\n" +
              "SUBJECT: " +
              caseData.subject +
              "\nQUESTION: " +
              caseData.question +
              "\nEVIDENCE: " +
              caseData.evidence
          }
        )
      ]);

      setDatabaseStatus(
        "CASE SAVED // " +
          caseData.caseNum,
        true
      );

      return record;
    } catch (error) {
      console.error(
        "Case save failed:",
        error
      );

      setDatabaseStatus(
        "CASE SAVE FAILED: " +
          error.message,
        false
      );

      return null;
    }
  }

  async function beginCase() {
    if (!selectedDivision) return;

    const subject =
      byId("caseSubject")
        .value.trim();

    const question =
      byId("caseQuestion")
        .value.trim();

    const evidence =
      byId("caseEvidence")
        .value.trim();

    const urgency =
      byId("caseUrgency").value;

    if (!question) {
      byId(
        "caseQuestion"
      ).style.borderColor =
        "var(--lux)";

      byId("caseQuestion").focus();
      return;
    }

    const division =
      DIVISIONS[selectedDivision];

    agent = division.agent;
    activeSystem = division.system;

    const caseNum =
      "SID-" +
      Date.now()
        .toString(36)
        .toUpperCase()
        .slice(-6);

    caseData = {
      division:
        selectedDivision,
      code:
        division.code,
      caseNum,
      subject:
        subject ||
        "UNNAMED CASE",
      question,
      evidence:
        evidence ||
        "NO ADDITIONAL EVIDENCE SUBMITTED",
      urgency
    };

    byId("caseintake")
      .classList.remove("show");

    if (currentSession) {
      const saved =
        await createCaseRecord();

      if (!saved) {
        const proceed =
          window.confirm(
            "The case could not be saved. Continue in unsaved mode?"
          );

        if (!proceed) return;
      }
    } else {
      setDatabaseStatus(
        "VISITOR CASE // NOT SAVED",
        false
      );
    }

    runAnalysisSequence(division);
  }

  function runAnalysisSequence(division) {
    const panel =
      byId("caseassign");

    const log =
      byId("scanLog");

    const reveal =
      byId("revealCard");

    log.innerHTML = "";
    reveal.classList.remove("show");

    byId(
      "assignCaseCode"
    ).textContent =
      "FILE // " +
      caseData.caseNum;

    panel.classList.add("show");

    const steps = [
      {
        text:
          "RECEIVING CASE FILE " +
          caseData.caseNum,
        type: "line"
      },
      {
        text:
          "INDEXING SUBJECT: " +
          caseData.subject.toUpperCase(),
        type: "line"
      },
      {
        text:
          "CROSS-REFERENCING 6 DIVISIONS...",
        type: "bars"
      },
      {
        text:
          "DIVISION LOCKED: " +
          division.name,
        type: "line"
      },
      {
        text:
          "MATCHING LEAD ANALYST...",
        type: "line"
      },
      {
        text:
          "ANALYST CONFIRMED: " +
          agent,
        type: "line"
      }
    ];

    let index = 0;

    function nextStep() {
      if (index >= steps.length) {
        setTimeout(function () {
          showRevealCard(division);
        }, 400);

        return;
      }

      const step = steps[index];

      if (step.type === "bars") {
        addScanLine(step.text);

        setTimeout(function () {
          addMatchBars();

          index += 1;

          setTimeout(
            nextStep,
            1400
          );
        }, 300);
      } else {
        addScanLine(step.text);

        setTimeout(function () {
          markLastDone();

          index += 1;

          setTimeout(
            nextStep,
            260
          );
        }, 380);
      }
    }

    setTimeout(nextStep, 300);
  }

  function addScanLine(text) {
    const log = byId("scanLog");

    const row =
      document.createElement("div");

    row.className = "scan-line";

    row.innerHTML =
      '<span class="scan-check">›</span>' +
      "<span>" +
      text +
      '<span class="scan-cursor"></span>' +
      "</span>";

    log.appendChild(row);

    requestAnimationFrame(
      function () {
        row.classList.add("show");
      }
    );
  }

  function markLastDone() {
    const lines =
      document.querySelectorAll(
        "#scanLog .scan-line"
      );

    if (!lines.length) return;

    const last =
      lines[lines.length - 1];

    last.classList.add("done");

    const check =
      last.querySelector(
        ".scan-check"
      );

    if (check) {
      check.textContent = "✓";
    }

    const cursor =
      last.querySelector(
        ".scan-cursor"
      );

    if (cursor) cursor.remove();
  }

  function addMatchBars() {
    const log = byId("scanLog");

    const wrap =
      document.createElement("div");

    wrap.className =
      "match-bars";

    DIV_ORDER.forEach(
      function (key) {
        const winner =
          key === selectedDivision;

        const percent = winner
          ? 88 +
            Math.floor(
              Math.random() * 10
            )
          : 15 +
            Math.floor(
              Math.random() * 45
            );

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "match-row" +
          (winner
            ? " winner"
            : "");

        row.innerHTML =
          '<div class="match-row-name">' +
          DIV_SHORT[key] +
          "</div>" +
          '<div class="match-row-track">' +
          '<div class="match-row-fill"></div>' +
          "</div>";

        wrap.appendChild(row);

        setTimeout(function () {
          row.querySelector(
            ".match-row-fill"
          ).style.width =
            percent + "%";
        }, 50);
      }
    );

    log.appendChild(wrap);

    setTimeout(
      markLastDone,
      650
    );
  }

  function showRevealCard(division) {
    byId("revealName").textContent =
      agent;

    byId("revealName").style.color =
      COLORS[agent];

    byId("revealRole").textContent =
      LABELS[agent] +
      " // " +
      division.code;

    byId("revealBrief").textContent =
      division.copy;

    byId("revealCard")
      .classList.add("show");
  }

  function addMsg(type, text) {
    const messages = byId("msgs");

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "msg " +
      (type === "agent"
        ? "mag"
        : "mme");

    const label =
      document.createElement("div");

    label.className = "mlbl";

    label.textContent =
      type === "agent"
        ? agent
        : "YOU";

    if (
      type === "agent" &&
      agent
    ) {
      label.style.color =
        COLORS[agent];
    }

    const body =
      document.createElement("div");

    body.className = "mbod";
    body.textContent = text;

    if (
      type === "agent" &&
      agent
    ) {
      body.style.borderLeftColor =
        COLORS[agent];
    }

    wrapper.appendChild(label);
    wrapper.appendChild(body);
    messages.appendChild(wrapper);

    messages.scrollTop =
      messages.scrollHeight;
  }

  function addNamedAnalystMsg(
    name,
    text
  ) {
    const oldAgent = agent;

    agent = name || oldAgent;
    addMsg("agent", text);
    agent = oldAgent;
  }

  function addNixMsg(text) {
    addNamedAnalystMsg(
      "NIX",
      text
    );
  }

  function addAshMsg(text) {
    addNamedAnalystMsg(
      "ASH",
      text
    );
  }

  function showThinking(label) {
    const messages = byId("msgs");

    const thinking =
      document.createElement("div");

    thinking.className = "thnk";
    thinking.id = "thnk";

    thinking.textContent =
      (label || agent) +
      " // processing...";

    messages.appendChild(thinking);

    messages.scrollTop =
      messages.scrollHeight;
  }

  function clearThinking() {
    const thinking =
      byId("thnk");

    if (thinking) {
      thinking.remove();
    }
  }

  async function saveCaseMessage(
    role,
    analystName,
    content
  ) {
    if (
      !currentCaseId ||
      !currentSession ||
      !content
    ) {
      return;
    }

    try {
      await InvestigationEngine.saveMessage(
        currentCaseId,
        {
          analyst:
            analystName ||
            agent ||
            "SID",
          role,
          content
        }
      );
    } catch (error) {
      console.error(
        "Message save failed:",
        error
      );
    }
  }

  async function saveCaseReport(
    analyst,
    reportType,
    content
  ) {
    if (
      !currentCaseId ||
      !currentSession ||
      !content
    ) {
      return;
    }

    try {
      await InvestigationEngine.saveReport(
        currentCaseId,
        {
          analyst,
          reportType,
          content
        }
      );

      setDatabaseStatus(
        "REPORT FILED // " +
          analyst,
        true
      );
    } catch (error) {
      console.error(
        "Report save failed:",
        error
      );
    }
  }

  async function updateCase(fields) {
    if (
      !currentCaseId ||
      !currentSession
    ) {
      return;
    }

    try {
      await InvestigationEngine.updateCase(
        currentCaseId,
        fields
      );
    } catch (error) {
      console.error(
        "Case update failed:",
        error
      );
    }
  }

  async function assignCaseAnalyst(
    name,
    role
  ) {
    if (
      !currentCaseId ||
      !currentSession
    ) {
      return;
    }

    try {
      await InvestigationEngine.assignAnalyst(
        currentCaseId,
        {
          analyst: name,
          role
        }
      );
    } catch (error) {
      console.error(
        "Assignment failed:",
        error
      );
    }
  }

  function buildCaseTranscript() {
    const division =
      DIVISIONS[selectedDivision];

    const lines = [
      "CASE " +
        caseData.caseNum +
        " — " +
        division.name +
        " — LEAD ANALYST: " +
        agent,
      "SUBJECT: " +
        caseData.subject,
      "URGENCY: " +
        caseData.urgency,
      ""
    ];

    msgHistory.forEach(
      function (message) {
        lines.push(
          (message.role === "user"
            ? "PERSON: "
            : "ANALYST (" +
              agent +
              "): ") +
            message.content
        );
      }
    );

    return lines.join("\n\n");
  }

  async function enterSecureChannel() {
    const division =
      DIVISIONS[selectedDivision];

    msgHistory = [];

    try {
      count = parseInt(
        sessionStorage.getItem(
          "msgCount"
        ) || "0",
        10
      );
    } catch (error) {
      count = 0;
    }

    byId("pw").classList.remove(
      "show"
    );

    byId("caseassign")
      .classList.remove("show");

    byId("hall").style.display =
      "none";

    const chatroom =
      byId("chatroom");

    chatroom.style.display =
      "flex";

    chatroom.style.flexDirection =
      "column";

    chatroom.style.flex = "1";

    byId("cname").textContent =
      division.name;

    byId("cname").style.color =
      division.color;

    byId("clabel").textContent =
      division.code +
      " // LEAD ANALYST: " +
      agent;

    byId("cbCase").textContent =
      caseData.caseNum;

    byId("cbUrgency").textContent =
      caseData.urgency;

    byId("cbAnalyst").textContent =
      agent;

    byId("msgs").innerHTML = "";

    const opening =
      "CASE OPENED // " +
      division.code +
      "\n\nSUBJECT: " +
      caseData.subject +
      "\nURGENCY: " +
      caseData.urgency +
      "\nLEAD ANALYST: " +
      agent +
      "\n\nPRIMARY QUESTION:\n" +
      caseData.question +
      "\n\nKNOWN EVIDENCE:\n" +
      caseData.evidence +
      "\n\nInvestigation active. Reviewing the record now.";

    addMsg("agent", opening);

    msgHistory.push({
      role: "user",
      content:
        "CASE REQUEST\n" +
        "Division: " +
        division.name +
        "\nSubject: " +
        caseData.subject +
        "\nUrgency: " +
        caseData.urgency +
        "\nPrimary question: " +
        caseData.question +
        "\nKnown evidence: " +
        caseData.evidence
    });

    showThinking();
    posting = true;
    byId("sbtn").disabled = true;

    try {
      const reply =
        await AnalystEngine.call({
          maxTokens: 350,
          system: activeSystem,
          messages: msgHistory
        });

      clearThinking();
      addMsg("agent", reply);

      msgHistory.push({
        role: "assistant",
        content: reply
      });

      await saveCaseMessage(
        "assistant",
        agent,
        reply
      );

      await saveCaseReport(
        agent,
        "initial_assessment",
        reply
      );

      await updateCase({
        current_finding:
          reply.slice(0, 1000)
      });
    } catch (error) {
      clearThinking();

      addMsg(
        "agent",
        "[" +
          agent +
          "]\n\nSignal interruption. Your case is still open. Send the question once more."
      );
    } finally {
      posting = false;
      byId("sbtn").disabled = false;
      byId("inp").focus();
    }
  }

  async function restoreSecureChannel(
    record,
    storedMessages
  ) {
    const division =
      DIVISIONS[selectedDivision];

    msgHistory = [];

    byId("boot").style.display =
      "none";

    byId("app").style.display =
      "flex";

    byId("caseassign")
      .classList.remove("show");

    const chatroom =
      byId("chatroom");

    chatroom.style.display =
      "flex";

    chatroom.style.flexDirection =
      "column";

    chatroom.style.flex = "1";

    byId("cname").textContent =
      division.name;

    byId("cname").style.color =
      division.color;

    byId("clabel").textContent =
      division.code +
      " // LEAD ANALYST: " +
      agent;

    byId("cbCase").textContent =
      caseData.caseNum;

    byId("cbUrgency").textContent =
      caseData.urgency;

    byId("cbAnalyst").textContent =
      agent;

    byId("cbStatus").textContent =
      String(
        record.status || "active"
      ).toUpperCase();

    byId("msgs").innerHTML = "";

    storedMessages.forEach(
      function (message) {
        if (message.role === "user") {
          addMsg(
            "user",
            message.content
          );
        } else if (
          message.analyst === "NIX"
        ) {
          addNixMsg(
            message.content
          );
        } else if (
          message.analyst === "ASH"
        ) {
          addAshMsg(
            message.content
          );
        } else {
          addNamedAnalystMsg(
            message.analyst ||
              agent,
            message.content
          );
        }

        msgHistory.push({
          role:
            message.role === "user"
              ? "user"
              : "assistant",
          content:
            message.content
        });
      }
    );
  }

  async function requestCrossSynthesis() {
    if (
      !agent ||
      !caseData ||
      posting
    ) {
      return;
    }

    const chip = byId("cbSynth");

    if (
      chip.dataset.state === "done" ||
      chip.dataset.state ===
        "pending"
    ) {
      return;
    }

    chip.dataset.state = "pending";
    chip.textContent = "COMPARING...";
    posting = true;
    byId("sbtn").disabled = true;
    showThinking("NIX");

    try {
      const reply =
        await AnalystEngine.call({
          maxTokens: 280,
          system: NIX_SYSTEM,
          messages: [
            {
              role: "user",
              content:
                buildCaseTranscript()
            }
          ]
        });

      clearThinking();
      addNixMsg(reply);

      await Promise.all([
        saveCaseMessage(
          "assistant",
          "NIX",
          reply
        ),

        assignCaseAnalyst(
          "NIX",
          "synthesis"
        ),

        saveCaseReport(
          "NIX",
          "cross_system_synthesis",
          reply
        ),

        updateCase({
          current_finding: reply
        })
      ]);

      chip.dataset.state = "done";
      chip.textContent = "NIX ✓";
    } catch (error) {
      clearThinking();

      addNixMsg(
        "Signal interrupted. Synthesis not complete. Try again."
      );

      chip.dataset.state = "";
      chip.textContent = "REQUEST →";
    } finally {
      posting = false;
      byId("sbtn").disabled = false;
    }
  }

  async function requestFinalAssessment() {
    if (
      !agent ||
      !caseData ||
      posting
    ) {
      return;
    }

    const chip = byId("cbReview");

    if (
      chip.dataset.state ===
        "closed" ||
      chip.dataset.state ===
        "pending"
    ) {
      return;
    }

    chip.dataset.state = "pending";
    chip.textContent = "REVIEWING...";
    posting = true;
    byId("sbtn").disabled = true;
    showThinking("ASH");

    try {
      const reply =
        await AnalystEngine.call({
          maxTokens: 280,
          system: ASH_SYSTEM,
          messages: [
            {
              role: "user",
              content:
                buildCaseTranscript()
            }
          ]
        });

      clearThinking();
      addAshMsg(reply);

      await Promise.all([
        saveCaseMessage(
          "assistant",
          "ASH",
          reply
        ),

        assignCaseAnalyst(
          "ASH",
          "final_assessment"
        ),

        saveCaseReport(
          "ASH",
          "final_assessment",
          reply
        )
      ]);

      await updateCase({
        status: "closed",
        current_finding: reply
      });

      chip.dataset.state = "closed";
      chip.textContent = "ASH ✓";

      byId("cbStatus").textContent =
        "CLOSED";

      byId("cbStatus")
        .classList.remove("live");
    } catch (error) {
      clearThinking();

      addAshMsg(
        "SIGNAL INTERRUPTED. REVIEW NOT COMPLETE. TRY AGAIN."
      );

      chip.dataset.state = "";
      chip.textContent = "REQUEST →";
    } finally {
      posting = false;
      byId("sbtn").disabled = false;
    }
  }

  function prepareEvidenceEntry() {
    const input = byId("inp");

    input.value = "[EVIDENCE]\n";
    input.focus();
    resizeInput(input);
  }

  async function saveOperatorNote() {
    if (
      !currentCaseId ||
      !currentSession
    ) {
      alert(
        "Sign in and save the case first."
      );

      return;
    }

    const note = window.prompt(
      "Add a private operator note:"
    );

    if (!note) return;

    await InvestigationEngine.saveEvidence(
      currentCaseId,
      {
        type: "operator_note",
        content: note
      }
    );

    addNamedAnalystMsg(
      "OPERATOR",
      "PRIVATE NOTE SAVED\n\n" +
        note
    );
  }

  function isUnlocked() {
    try {
      return (
        sessionStorage.getItem("u") ===
        "1"
      );
    } catch (error) {
      return false;
    }
  }

  async function send() {
    if (posting || !agent) return;

    const input = byId("inp");
    const text = input.value.trim();

    if (!text) return;

    posting = true;
    byId("sbtn").disabled = true;

    input.value = "";
    input.style.height = "auto";

    addMsg("user", text);

    msgHistory.push({
      role: "user",
      content: text
    });

    await saveCaseMessage(
      "user",
      "MEMBER",
      text
    );

    if (
      text.startsWith("[EVIDENCE]") &&
      currentSession &&
      currentCaseId
    ) {
      await InvestigationEngine.saveEvidence(
        currentCaseId,
        {
          type:
            "submitted_evidence",
          content:
            text.replace(
              /^\[EVIDENCE\]\s*/,
              ""
            )
        }
      );
    }

    count += 1;

    try {
      sessionStorage.setItem(
        "msgCount",
        count
      );
    } catch (error) {}

    if (
      !currentSession &&
      !isUnlocked() &&
      count > FREE
    ) {
      byId("pw")
        .classList.add("show");

      posting = false;
      byId("sbtn").disabled = false;
      return;
    }

    showThinking();

    try {
      const reply =
        await AnalystEngine.call({
          maxTokens: 350,
          system: activeSystem,
          messages: msgHistory
        });

      clearThinking();
      addMsg("agent", reply);

      msgHistory.push({
        role: "assistant",
        content: reply
      });

      await saveCaseMessage(
        "assistant",
        agent,
        reply
      );

      await saveCaseReport(
        agent,
        "case_log",
        reply
      );

      await updateCase({
        current_finding:
          reply.slice(0, 1000)
      });
    } catch (error) {
      clearThinking();

      addMsg(
        "agent",
        "[" +
          agent +
          "]\n\nSignal interruption. Try again."
      );
    } finally {
      posting = false;
      byId("sbtn").disabled = false;
      byId("inp").focus();
    }
  }

  function returnToDashboard() {
    window.location.href =
      "dashboard/index.html" +
      (currentCaseId
        ? "?case=" +
          encodeURIComponent(
            currentCaseId
          )
        : "");
  }

  function backToHall() {
    byId("chatroom").style.display =
      "none";

    byId("caseassign")
      .classList.remove("show");

    byId("hall").style.display =
      "flex";

    agent = null;
    msgHistory = [];
    selectedDivision = null;
    activeSystem = "";
    caseData = null;
    currentCaseId = null;
  }

  function resizeInput(element) {
    element.style.height = "auto";

    element.style.height =
      Math.min(
        element.scrollHeight,
        80
      ) + "px";
  }

  function onKey(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      send();
    }
  }

  function validateCode() {
    const input =
      byId("accessCodeInp");

    const error =
      byId("codeError");

    const value =
      input.value
        .trim()
        .toUpperCase();

    if (
      value === "WILD44" ||
      value === "SISTER44" ||
      value.startsWith("WS-")
    ) {
      try {
        sessionStorage.setItem(
          "u",
          "1"
        );
      } catch (storageError) {}

      byId("pw")
        .classList.remove("show");

      error.style.display = "none";
      return;
    }

    error.style.display = "block";
  }

  global.enterApp = enterApp;
  global.openDivision = openDivision;
  global.closeCaseIntake =
    closeCaseIntake;
  global.beginCase = beginCase;
  global.enterSecureChannel =
    enterSecureChannel;
  global.requestCrossSynthesis =
    requestCrossSynthesis;
  global.requestFinalAssessment =
    requestFinalAssessment;
  global.prepareEvidenceEntry =
    prepareEvidenceEntry;
  global.saveOperatorNote =
    saveOperatorNote;
  global.returnToDashboard =
    returnToDashboard;
  global.backToHall = backToHall;
  global.send = send;
  global.rsz = resizeInput;
  global.onKey = onKey;
  global.validateCode = validateCode;

  document.addEventListener(
    "DOMContentLoaded",
    function () {
      initializeDatabaseSession();

      const params =
        new URLSearchParams(
          window.location.search
        );

      const requested =
        params.get("division");

      if (
        requested &&
        DIVISIONS[requested]
      ) {
        enterApp();
        openDivision(requested);
      }
    }
  );
})(window);
