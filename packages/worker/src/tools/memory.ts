import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { Env, MemoryEntry, ToolDefinition, UserMemory } from "../types";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "remember_fact",
    "Save a fact, preference, or piece of context to the user's long-term memory. Use this when the user tells you something worth remembering across conversations — project names, preferences, team members, decisions, etc.",
    parametersSchema(
      {
        text: stringProp({
          description:
            "The fact or preference to remember (e.g. 'Our sprints start on Mondays', 'Default Jira project is BAT')",
        }),
        category: stringProp({
          description: "Category: 'fact', 'preference', 'project', 'team', or 'plan_outcome'",
          enum: ["fact", "preference", "project", "team", "plan_outcome"],
        }),
      },
      ["text", "category"],
    ),
  ),
  createToolDefinition(
    "recall_memory",
    "Retrieve everything stored in the user's long-term memory. Use this when you need context about the user's projects, preferences, team, or past decisions.",
    parametersSchema({}),
  ),
];

// ---------------------------------------------------------------------------
// KV helpers
// ---------------------------------------------------------------------------

function memoryKey(userId: string): string {
  return `memory:${userId}`;
}

export function emptyMemory(): UserMemory {
  return {
    projects: [],
    preferences: {},
    facts: [],
    planOutcomes: [],
    teamContext: { members: [], roles: {} },
    entries: [],
  };
}

/**
 * Migrate legacy categorized memory to the flat entries array.
 * Only runs when entries is empty but legacy data exists.
 */
function migrateToEntries(memory: UserMemory): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const fact of memory.facts) {
    entries.push({
      id: crypto.randomUUID(),
      title: fact.text.slice(0, 60),
      content: fact.text,
      category: "fact",
      alwaysInclude: true,
      createdAt: fact.createdAt,
      source: fact.source,
    });
  }

  for (const [key, value] of Object.entries(memory.preferences)) {
    entries.push({
      id: crypto.randomUUID(),
      title: key,
      content: `${key}: ${String(value)}`,
      category: "preference",
      alwaysInclude: true,
      createdAt: today,
      source: "user",
    });
  }

  for (const project of memory.projects) {
    entries.push({
      id: crypto.randomUUID(),
      title: project.key,
      content: `${project.key}: ${project.name}${project.board ? ` (board: ${project.board})` : ""}`,
      category: "project",
      alwaysInclude: true,
      createdAt: project.lastMentioned,
      source: "user",
    });
  }

  for (const member of memory.teamContext.members) {
    const role = memory.teamContext.roles[member];
    entries.push({
      id: crypto.randomUUID(),
      title: member,
      content: role ? `${member} (${role})` : member,
      category: "team",
      alwaysInclude: true,
      createdAt: today,
      source: "user",
    });
  }

  for (const outcome of memory.planOutcomes) {
    entries.push({
      id: crypto.randomUUID(),
      title: outcome.title,
      content: outcome.notes ? `${outcome.title}: ${outcome.notes}` : outcome.title,
      category: "plan_outcome",
      alwaysInclude: true,
      createdAt: outcome.date,
      source: "agent",
    });
  }

  return entries;
}

export async function loadMemory(
  userId: string,
  env: Env,
): Promise<UserMemory> {
  const raw = await env.PLANBOT_CONFIG.get(memoryKey(userId));
  if (!raw) return emptyMemory();
  let memory: UserMemory;
  try {
    memory = JSON.parse(raw) as UserMemory;
  } catch {
    return emptyMemory();
  }
  // Ensure entries array exists (backward compat)
  if (!memory.entries) memory.entries = [];
  // Auto-migrate legacy data to entries on first load
  const hasLegacyData =
    memory.facts.length > 0 ||
    Object.keys(memory.preferences).length > 0 ||
    memory.projects.length > 0 ||
    memory.teamContext.members.length > 0 ||
    memory.planOutcomes.length > 0;
  if (hasLegacyData && memory.entries.length === 0) {
    memory.entries = migrateToEntries(memory);
    // Persist migrated state
    await env.PLANBOT_CONFIG.put(memoryKey(userId), JSON.stringify(memory));
  }
  return memory;
}

export async function saveMemory(
  userId: string,
  memory: UserMemory,
  env: Env,
): Promise<void> {
  await env.PLANBOT_CONFIG.put(memoryKey(userId), JSON.stringify(memory));
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
  userId?: string,
): Promise<unknown> {
  if (!userId) {
    throw new Error("User ID is required for memory tools");
  }

  switch (name) {
    case "remember_fact": {
      const text = args.text as string;
      const category = args.category as string;
      const memory = await loadMemory(userId, env);
      const now = new Date().toISOString().slice(0, 10);

      switch (category) {
        case "fact":
          // Avoid duplicates
          if (!memory.facts.some((f) => f.text === text)) {
            memory.facts.push({ text, source: "user", createdAt: now });
          }
          break;

        case "preference": {
          // Parse "key = value" or just store as fact
          const eqIdx = text.indexOf("=");
          if (eqIdx > 0) {
            const key = text.slice(0, eqIdx).trim();
            const value = text.slice(eqIdx + 1).trim();
            memory.preferences[key] = value;
          } else {
            memory.preferences[text] = true;
          }
          break;
        }

        case "project": {
          // Parse "KEY - Name" or just store key
          const dashIdx = text.indexOf("-");
          if (dashIdx > 0 && dashIdx < 8) {
            // Looks like "BAT - Batman project"
            const parts = text.split(/\s*-\s*/);
            const key = parts[0].trim().toUpperCase();
            const projName = parts.slice(1).join("-").trim();
            const existing = memory.projects.find((p) => p.key === key);
            if (existing) {
              existing.name = projName || existing.name;
              existing.lastMentioned = now;
            } else {
              memory.projects.push({ key, name: projName || key, lastMentioned: now });
            }
          } else {
            const key = text.trim().toUpperCase();
            if (!memory.projects.some((p) => p.key === key)) {
              memory.projects.push({ key, name: key, lastMentioned: now });
            }
          }
          break;
        }

        case "team": {
          // Parse "Name (role)" or just "Name"
          const match = text.match(/^(.+?)\s*\((.+)\)$/);
          if (match) {
            const memberName = match[1].trim();
            const role = match[2].trim();
            if (!memory.teamContext.members.includes(memberName)) {
              memory.teamContext.members.push(memberName);
            }
            memory.teamContext.roles[memberName] = role;
          } else {
            const memberName = text.trim();
            if (!memory.teamContext.members.includes(memberName)) {
              memory.teamContext.members.push(memberName);
            }
          }
          break;
        }

        case "plan_outcome":
          memory.planOutcomes.push({ title: text, date: now });
          break;
      }

      // Also write to the flat entries array
      const entryContent =
        category === "preference" && text.includes("=")
          ? text
          : category === "team"
          ? text
          : text;
      const isDuplicate = memory.entries.some(
        (e) => e.content === entryContent && e.category === category,
      );
      if (!isDuplicate) {
        memory.entries.push({
          id: crypto.randomUUID(),
          title: text.slice(0, 60),
          content: entryContent,
          category: category as MemoryEntry["category"],
          alwaysInclude: true,
          createdAt: now,
          source: "agent",
        });
      }

      await saveMemory(userId, memory, env);
      return { success: true, message: `Remembered: ${text}` };
    }

    case "recall_memory": {
      const memory = await loadMemory(userId, env);
      return memory;
    }

    default:
      throw new Error(`Unknown memory tool: ${name}`);
  }
}
