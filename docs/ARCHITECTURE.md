# WILD SISTER ARCHITECTURE

Version: 2.0  
Status: Live Platform / Active Refactor

---

# SYSTEM OVERVIEW

Wild Sister is a modular investigation platform.

The public website introduces the institution.

The Terminal opens investigations.

Supabase stores cases, evidence, messages, analysts, and reports.

The Operations Center displays private case activity.

The SID Archive stores published institutional files.

Claude-powered analysts produce findings.

SCRIBE will turn completed investigations into permanent archive files.

---

# PRIMARY USER FLOW

```text
Visitor or Member
        ↓
Home / Pricing / Divisions
        ↓
terminal.html
        ↓
Case Intake
        ↓
Supabase
        ↓
Lead Analyst
        ↓
case_messages
case_evidence
case_analysts
case_reports
        ↓
dashboard/index.html
        ↓
NIX Synthesis
        ↓
ASH Final Assessment
        ↓
SCRIBE
        ↓
archive_files
        ↓
sid.html
