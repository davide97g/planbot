import * as XLSX from "xlsx";
import type { PlanningResult } from "./types";

export function generateExcel(result: PlanningResult): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Plan
  const planRows = result.tasks.map((t) => ({
    Key: t.key,
    Summary: t.summary,
    Stream: t.stream,
    Owner: t.owner,
    Start: t.start_date,
    Due: t.due_date,
    BDG: t.bdg,
    ACT: t.act,
    ETC: t.etc,
    EAC: t.eac,
    Diff: t.diff,
    Status: t.status,
    Dependencies: t.dependencies.join(", "),
  }));

  const planSheet = XLSX.utils.json_to_sheet(planRows);
  XLSX.utils.book_append_sheet(wb, planSheet, "Plan");

  // Sheet 2: Risks
  const riskRows = result.risks.map((r) => ({
    Type: r.type,
    Severity: r.severity,
    Description: r.description,
    "Affected Tasks": r.affected_tasks.join(", "),
    Mitigation: r.mitigation,
  }));

  const riskSheet = XLSX.utils.json_to_sheet(riskRows);
  XLSX.utils.book_append_sheet(wb, riskSheet, "Risks");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
