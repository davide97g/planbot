import { z } from "zod";
import type { Env, TeamCapacity } from "./types";

const TeamCapacitySchema = z.object({
  team_name: z.string(),
  members: z.array(
    z.object({
      name: z.string(),
      capacity_hours_per_day: z.number(),
      skills: z.array(z.string()),
    }),
  ),
  holidays: z.array(z.string()),
  sprint_length_days: z.number(),
});

const DEFAULT_CAPACITY: TeamCapacity = {
  team_name: "default",
  members: [{ name: "Team Member", capacity_hours_per_day: 6, skills: [] }],
  holidays: [],
  sprint_length_days: 10,
};

export async function loadTeamCapacity(name: string, env: Env): Promise<TeamCapacity> {
  const raw = await env.PLANBOT_CONFIG.get(`team:${name}`);
  if (!raw) return { ...DEFAULT_CAPACITY, team_name: name };

  try {
    return TeamCapacitySchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CAPACITY, team_name: name };
  }
}

export function workingDays(from: Date, to: Date, holidays: string[]): number {
  const holidaySet = new Set(holidays);
  let count = 0;
  const current = new Date(from);

  while (current <= to) {
    const day = current.getDay();
    const iso = current.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export function totalCapacityHours(capacity: TeamCapacity, from: Date, to: Date): number {
  const days = workingDays(from, to, capacity.holidays);
  const dailyHours = capacity.members.reduce((sum, m) => sum + m.capacity_hours_per_day, 0);
  return days * dailyHours;
}
