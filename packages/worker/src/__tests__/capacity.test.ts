import { describe, it, expect } from "vitest";
import { loadTeamCapacity, workingDays, totalCapacityHours } from "../capacity";

describe("loadTeamCapacity", () => {
  it("returns parsed capacity from KV", async () => {
    const data = {
      team_name: "backend",
      members: [{ name: "Alice", capacity_hours_per_day: 6, skills: ["go"] }],
      holidays: ["2024-12-25"],
      sprint_length_days: 14,
    };

    const env = {
      PLANBOT_CONFIG: { get: async () => JSON.stringify(data) },
    } as any;

    const result = await loadTeamCapacity("backend", env);
    expect(result.team_name).toBe("backend");
    expect(result.members).toHaveLength(1);
    expect(result.sprint_length_days).toBe(14);
  });

  it("returns default capacity when KV key is missing", async () => {
    const env = {
      PLANBOT_CONFIG: { get: async () => null },
    } as any;

    const result = await loadTeamCapacity("unknown", env);
    expect(result.team_name).toBe("unknown");
    expect(result.members).toHaveLength(1);
    expect(result.sprint_length_days).toBe(10);
  });

  it("returns default capacity on invalid JSON", async () => {
    const env = {
      PLANBOT_CONFIG: { get: async () => "not json" },
    } as any;

    const result = await loadTeamCapacity("bad", env);
    expect(result.team_name).toBe("bad");
    expect(result.members).toHaveLength(1);
  });
});

describe("workingDays", () => {
  it("counts weekdays only", () => {
    // Mon 2024-01-01 to Fri 2024-01-05 = 5 working days
    const result = workingDays(new Date("2024-01-01"), new Date("2024-01-05"), []);
    expect(result).toBe(5);
  });

  it("excludes weekends", () => {
    // Mon 2024-01-01 to Sun 2024-01-07 = 5 working days
    const result = workingDays(new Date("2024-01-01"), new Date("2024-01-07"), []);
    expect(result).toBe(5);
  });

  it("excludes holidays", () => {
    // Mon-Fri with Wed as holiday = 4 days
    const result = workingDays(new Date("2024-01-01"), new Date("2024-01-05"), ["2024-01-03"]);
    expect(result).toBe(4);
  });

  it("returns 0 for weekend-only range", () => {
    // Sat-Sun
    const result = workingDays(new Date("2024-01-06"), new Date("2024-01-07"), []);
    expect(result).toBe(0);
  });
});

describe("totalCapacityHours", () => {
  it("calculates total hours for team", () => {
    const capacity = {
      team_name: "test",
      members: [
        { name: "A", capacity_hours_per_day: 6, skills: [] },
        { name: "B", capacity_hours_per_day: 4, skills: [] },
      ],
      holidays: [],
      sprint_length_days: 10,
    };

    // 5 working days * 10 hours/day = 50
    const result = totalCapacityHours(capacity, new Date("2024-01-01"), new Date("2024-01-05"));
    expect(result).toBe(50);
  });
});
