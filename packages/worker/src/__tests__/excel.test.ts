import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { generateExcel } from "../excel";
import type { PlanningResult } from "../types";

const makeResult = (): PlanningResult => ({
  title: "Test Plan",
  generated_at: "2024-01-01T00:00:00.000Z",
  horizon: { from: "2024-01-01", to: "2024-01-14" },
  tasks: [
    {
      key: "T-1",
      summary: "Task 1",
      stream: "Backend",
      owner: "Alice",
      start_date: "2024-01-01",
      due_date: "2024-01-05",
      bdg: 5,
      act: 2,
      etc: 3,
      eac: 5,
      diff: 0,
      status: "on_track",
      dependencies: ["T-2"],
    },
  ],
  risks: [
    {
      type: "timeline",
      severity: "high",
      description: "Tight deadline",
      affected_tasks: ["T-1"],
      mitigation: "Add buffer",
    },
  ],
  summary: {
    total_tasks: 1,
    team_size: 1,
    at_risk_count: 0,
    blocked_count: 0,
    completion_confidence: 90,
  },
});

describe("generateExcel", () => {
  it("returns a non-empty ArrayBuffer", () => {
    const buffer = generateExcel(makeResult());
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("contains Plan and Risks sheets", () => {
    const buffer = generateExcel(makeResult());
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    expect(wb.SheetNames).toContain("Plan");
    expect(wb.SheetNames).toContain("Risks");
  });

  it("has correct data in Plan sheet", () => {
    const buffer = generateExcel(makeResult());
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const data = XLSX.utils.sheet_to_json(wb.Sheets["Plan"]) as Record<string, unknown>[];
    expect(data).toHaveLength(1);
    expect(data[0]["Key"]).toBe("T-1");
    expect(data[0]["Owner"]).toBe("Alice");
    expect(data[0]["Dependencies"]).toBe("T-2");
  });
});
