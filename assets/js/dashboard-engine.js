(() => {
  "use strict";

  let currentUser = null;
  let currentCases = [];
  let selectedCaseId = null;

  const byId = (id) => document.getElementById(id);

  function showDashboard() {
    const loadingGate = byId("loadingGate");
    const dashboardContent = byId("dashboardContent");

    if (loadingGate) loadingGate.style.display = "none";
    if (dashboardContent) dashboardContent.style.display = "block";
  }

  function showDashboardError(message) {
    const loadingGate = byId("loadingGate");
    const errorNote = byId("errorNote");

    if (loadingGate) {
      loadingGate.textContent = `// DASHBOARD ERROR: ${message}`;
    }

    if (errorNote) {
      errorNote.innerHTML = `
        <div class="empty-board">
          <div class="empty-board-title">SYSTEM ERROR</div>
          <p>${escapeHtml(message)}</p>
        </div>
      `;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatCaseCode(caseItem) {
    return (
      caseItem.case_number ||
      caseItem.case_code ||
      caseItem.code ||
      `CASE-${String(caseItem.id || "").slice(0, 8).toUpperCase()}`
    );
  }

  function formatDate(value) {
    if (!value) return "UNKNOWN DATE";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  }

  function getCaseStatus(caseItem) {
    return String(caseItem.status || "active").toLowerCase();
  }

  function updateHeader() {
    const dateNode = byId("currentDate");
    const operatorNode = byId("operatorName");
    const clearanceNode = byId("navClearance");

    if (dateNode) {
      dateNode.textContent = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit"
      });
    }

    if (operatorNode) {
      const name =
        currentUser?.user_metadata?.full_name ||
        currentUser?.user_metadata?.name ||
        currentUser?.email ||
        "MEMBER";

      operatorNode.textContent = String(name).toUpperCase();
    }

    if (clearanceNode) {
      clearanceNode.textContent = currentUser ? "VERIFIED" : "VISITOR";
    }
  }

  function updateStats() {
    const active = currentCases.filter(
      (item) => getCaseStatus(item) === "active"
    ).length;

    const closed = currentCases.filter(
      (item) => getCaseStatus(item) === "closed"
    ).length;

    if (byId("statActive")) {
      byId("statActive").textContent = String(active).padStart(2, "0");
    }

    if (byId("statClosed")) {
      byId("statClosed").textContent = String(closed).padStart(2, "0");
    }

    if (byId("statArchive")) {
      byId("statArchive").textContent = String(currentCases.length).padStart(
        2,
        "0"
      );
    }
  }

  function renderCases(cases = currentCases) {
    const grid = byId("caseGrid");

    if (!grid) return;

    if (!cases.length) {
      grid.innerHTML = `
        <div class="empty-board">
          <div class="empty-board-title">NO CASE FILES FOUND</div>
          <p>Open a new investigation to create the first file.</p>
          <a href="../terminal.html">OPEN TERMINAL →</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = cases
      .map((caseItem) => {
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
          "UNASSIGNED DIVISION"
        );
        const status = getCaseStatus(caseItem);
        const created = escapeHtml(
          formatDate(caseItem.created_at || caseItem.updated_at)
        );

        return `
          <button
            type="button"
            class="case-file-card ${
              String(selectedCaseId) === String(caseItem.id) ? "selected" : ""
            }"
            onclick="selectDashboardCase('${id}')"
          >
            <span class="case-pin"></span>
            <span class="case-code">${code}</span>
            <strong>${title}</strong>
            <span class="case-detail">${division}</span>
            <span class="case-detail">OPENED ${created}</span>
            <span class="case-status ${status === "closed" ? "closed" : "active"}">
              ${escapeHtml(status.toUpperCase())}
            </span>
          </button>
        `;
      })
      .join("");
  }

  async function selectDashboardCase(caseId) {
    selectedCaseId = caseId;

    renderCases();

    const selected = currentCases.find(
      (item) => String(item.id) === String(caseId)
    );

    if (!selected) return;

    const continueButton = byId("continueCaseBtn");
    const refreshButton = byId("refreshCaseBtn");
    const reportButton = byId("prepareReportBtn");

    if (continueButton) {
      continueButton.href =
        "../terminal.html?case=" + encodeURIComponent(caseId);
    }

    if (refreshButton) refreshButton.disabled = false;
    if (reportButton) reportButton.disabled = false;

    try {
      const bundle = await InvestigationEngine.loadCaseBundle(caseId);

      renderCaseWall(selected, bundle);
      renderFeed(bundle);
    } catch (error) {
      console.error("Unable to load selected case:", error);
      renderCaseWall(selected, null);
    }
  }

  function renderCaseWall(caseItem, bundle) {
    const evidence = bundle?.evidence || [];
    const reports = bundle?.reports || [];
    const analysts = bundle?.analysts || [];

    const latestEvidence = evidence[0] || {};
    const latestReport = reports[0] || {};

    if (byId("wallHeader")) {
      byId("wallHeader").textContent =
        `CASE WALL // ${formatCaseCode(caseItem)}`;
    }

    if (byId("boardQuestion")) {
      byId("boardQuestion").textContent =
        caseItem.question ||
        caseItem.subject ||
        caseItem.title ||
        "No submitted question.";
    }

    if (byId("boardBirthData")) {
      byId("boardBirthData").textContent =
        caseItem.birth_data ||
        caseItem.birth_details ||
        caseItem.client_birth_data ||
        "No birth data stored.";
    }

    if (byId("boardEvidence")) {
      byId("boardEvidence").textContent =
        latestEvidence.content ||
        latestEvidence.evidence ||
        latestEvidence.summary ||
        "No evidence filed.";
    }

    if (byId("boardTheme")) {
      byId("boardTheme").textContent =
        caseItem.theme ||
        caseItem.current_theme ||
        latestReport.theme ||
        "Theme not yet confirmed.";
    }

    if (byId("boardSynthesis")) {
      byId("boardSynthesis").textContent =
        latestReport.content ||
        latestReport.report ||
        latestReport.summary ||
        "No synthesis filed.";
    }

    if (byId("boardPattern")) {
      byId("boardPattern").textContent =
        caseItem.key_pattern ||
        latestReport.key_pattern ||
        "No confirmed pattern yet.";
    }

    if (byId("boardChartText")) {
      const analystNames = analysts
        .map((item) => item.analyst_name || item.analyst || item.name)
        .filter(Boolean);

      byId("boardChartText").textContent =
        `${evidence.length} evidence item(s)\n` +
        `${reports.length} report(s)\n` +
        `${analystNames.length ? analystNames.join(", ") : "No analysts assigned"}`;
    }

    renderEvidenceFolders(evidence);
  }

  function renderEvidenceFolders(evidence) {
    const container = byId("evidenceFolders");

    if (!container) return;

    if (!evidence.length) {
      container.innerHTML = `
        <div class="folder">
          <small>EVIDENCE FILE</small>
          No evidence filed
        </div>
      `;
      return;
    }

    container.innerHTML = evidence
      .slice(0, 6)
      .map((item, index) => {
        const label = escapeHtml(
          item.title ||
          item.evidence_type ||
          item.type ||
          `Evidence ${index + 1}`
        );

        return `
          <div class="folder">
            <small>EVIDENCE FILE ${String(index + 1).padStart(2, "0")}</small>
            ${label}
          </div>
        `;
      })
      .join("");
  }

  function renderFeed(bundle) {
    const feed = byId("institutionFeed");

    if (!feed) return;

    const messages = bundle?.messages || [];
    const reports = bundle?.reports || [];
    const evidence = bundle?.evidence || [];

    const activity = [
      ...messages.map((item) => ({
        label: "MESSAGE FILED",
        text: item.content || item.message || item.body || "New message"
      })),
      ...reports.map((item) => ({
        label: "REPORT FILED",
        text: item.title || item.summary || "New report"
      })),
      ...evidence.map((item) => ({
        label: "EVIDENCE
