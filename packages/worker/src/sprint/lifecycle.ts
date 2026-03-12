import type { Env, NotificationPreferences, JiraIssue } from "../types";
import { getAtlassianAccessToken } from "../api/atlassian-oauth";
import { searchIssues } from "../jira";
import { sendSlackDM } from "../notifications/delivery";

// ---------------------------------------------------------------------------
// Sprint boundary detection + automation
// ---------------------------------------------------------------------------

interface SprintInfo {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  boardId?: number;
}

/**
 * Check for sprint boundaries (ending yesterday or starting today).
 * Called from the notification scheduler cron.
 */
export async function checkSprintBoundaries(
  userId: string,
  prefs: NotificationPreferences,
  env: Env,
): Promise<void> {
  let auth: { accessToken: string; cloudId: string };
  try {
    auth = await getAtlassianAccessToken(userId, env);
  } catch {
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Get active sprint details via Jira Agile API
  const sprints = await getRecentSprints(auth, env);

  for (const sprint of sprints) {
    // Sprint just ended (completeDate was yesterday)
    if (sprint.endDate?.startsWith(yesterday) && sprint.state === "closed") {
      const review = await generateSprintReview(sprint, auth, env);
      if (review && prefs.slackUserId) {
        await sendSlackDM(prefs.slackUserId, review, env);
      }
      // Save review to KV for historical tracking
      await saveSprintReview(sprint, review ?? "", env);
      // Update velocity history
      await updateVelocityHistory(sprint, auth, env);
    }

    // Sprint just started (startDate is today)
    if (sprint.startDate?.startsWith(today) && sprint.state === "active") {
      const summary = await generateSprintStartSummary(sprint, auth, env);
      if (summary && prefs.slackUserId) {
        await sendSlackDM(prefs.slackUserId, summary, env);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sprint review generation
// ---------------------------------------------------------------------------

export async function generateSprintReview(
  sprint: SprintInfo,
  auth: { accessToken: string; cloudId: string },
  env: Env,
): Promise<string | null> {
  const issues = await safeSearch(
    `sprint = "${sprint.name}" ORDER BY status ASC`,
    env,
    auth,
  );

  if (issues.length === 0) return null;

  const done = issues.filter(
    (i) => i.status === "Done" || i.status === "Closed",
  );
  const notDone = issues.filter(
    (i) => i.status !== "Done" && i.status !== "Closed",
  );
  const blocked = issues.filter(
    (i) => i.status === "Blocked",
  );

  const totalPoints = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const completedPoints = done.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const completionRate =
    issues.length > 0 ? Math.round((done.length / issues.length) * 100) : 0;

  const sections: string[] = [];
  sections.push(`:checkered_flag: *Sprint Review: ${sprint.name}*`);
  sections.push(`_${sprint.startDate ?? "?"} → ${sprint.endDate ?? "?"}_`);

  sections.push(
    `\n*Summary:*\n` +
      `• Total issues: ${issues.length}\n` +
      `• Completed: ${done.length} (${completionRate}%)\n` +
      `• Carryover: ${notDone.length}\n` +
      `• Story points: ${completedPoints}/${totalPoints} completed\n` +
      (blocked.length > 0 ? `• Blockers encountered: ${blocked.length}` : ""),
  );

  if (notDone.length > 0) {
    sections.push(
      `\n*Carryover Items:*\n` +
        notDone
          .slice(0, 10)
          .map((i) => `• *${i.key}* — ${i.summary} (${i.status})`)
          .join("\n"),
    );
  }

  if (done.length > 0) {
    sections.push(
      `\n*Completed:*\n` +
        done
          .slice(0, 15)
          .map((i) => `• *${i.key}* — ${i.summary}`)
          .join("\n") +
        (done.length > 15 ? `\n_...and ${done.length - 15} more_` : ""),
    );
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Sprint start summary
// ---------------------------------------------------------------------------

async function generateSprintStartSummary(
  sprint: SprintInfo,
  auth: { accessToken: string; cloudId: string },
  env: Env,
): Promise<string | null> {
  const issues = await safeSearch(
    `sprint = "${sprint.name}" ORDER BY priority DESC`,
    env,
    auth,
  );

  if (issues.length === 0) return null;

  const totalPoints = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);

  // Get historical velocity for comparison
  const velocity = await getVelocityHistory(sprint.boardId ?? 0, env);
  let velocityNote = "";
  if (velocity.length >= 2) {
    const avg =
      velocity.reduce((s, v) => s + v.completed, 0) / velocity.length;
    const diff = totalPoints - avg;
    if (diff > avg * 0.2) {
      velocityNote = `\n:warning: _Committed ${totalPoints} pts vs ${Math.round(avg)} avg — consider reducing scope_`;
    }
  }

  return (
    `:rocket: *Sprint Started: ${sprint.name}*\n` +
    `_${sprint.startDate ?? "today"} → ${sprint.endDate ?? "?"}_\n\n` +
    `• ${issues.length} issues, ${totalPoints} story points committed\n` +
    `• Unassigned: ${issues.filter((i) => !i.assignee).length}` +
    velocityNote
  );
}

// ---------------------------------------------------------------------------
// Historical data — KV storage for velocity trends
// ---------------------------------------------------------------------------

interface VelocityEntry {
  sprintName: string;
  committed: number;
  completed: number;
  date: string;
}

async function updateVelocityHistory(
  sprint: SprintInfo,
  auth: { accessToken: string; cloudId: string },
  env: Env,
): Promise<void> {
  const boardId = sprint.boardId ?? 0;
  const issues = await safeSearch(
    `sprint = "${sprint.name}"`,
    env,
    auth,
  );

  const committed = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const completed = issues
    .filter((i) => i.status === "Done" || i.status === "Closed")
    .reduce((s, i) => s + (i.storyPoints ?? 0), 0);

  const key = `sprint:${boardId}:velocity`;
  const raw = await env.PLANBOT_CONFIG.get(key);
  const history: VelocityEntry[] = raw ? JSON.parse(raw) : [];

  history.push({
    sprintName: sprint.name,
    committed,
    completed,
    date: new Date().toISOString().slice(0, 10),
  });

  // Keep last 12 sprints
  const trimmed = history.slice(-12);
  await env.PLANBOT_CONFIG.put(key, JSON.stringify(trimmed));
}

async function getVelocityHistory(
  boardId: number,
  env: Env,
): Promise<VelocityEntry[]> {
  const key = `sprint:${boardId}:velocity`;
  const raw = await env.PLANBOT_CONFIG.get(key);
  return raw ? JSON.parse(raw) : [];
}

async function saveSprintReview(
  sprint: SprintInfo,
  review: string,
  env: Env,
): Promise<void> {
  const boardId = sprint.boardId ?? 0;
  const key = `sprint:${boardId}:${sprint.id}:review`;
  await env.PLANBOT_CONFIG.put(key, review);
}

// ---------------------------------------------------------------------------
// Jira Agile API — get sprint info
// ---------------------------------------------------------------------------

async function getRecentSprints(
  auth: { accessToken: string; cloudId: string },
  env: Env,
): Promise<SprintInfo[]> {
  try {
    // Get all boards first
    const boardRes = await fetch(
      `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/agile/1.0/board?maxResults=10`,
      { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
    );

    if (!boardRes.ok) return [];
    const boardData = (await boardRes.json()) as {
      values: { id: number; name: string }[];
    };

    const sprints: SprintInfo[] = [];

    for (const board of boardData.values.slice(0, 5)) {
      const sprintRes = await fetch(
        `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/agile/1.0/board/${board.id}/sprint?state=active,closed&maxResults=5`,
        { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
      );

      if (!sprintRes.ok) continue;
      const sprintData = (await sprintRes.json()) as {
        values: {
          id: number;
          name: string;
          state: string;
          startDate?: string;
          endDate?: string;
          completeDate?: string;
        }[];
      };

      for (const s of sprintData.values) {
        sprints.push({
          id: s.id,
          name: s.name,
          state: s.state,
          startDate: s.startDate?.slice(0, 10),
          endDate: (s.completeDate ?? s.endDate)?.slice(0, 10),
          boardId: board.id,
        });
      }
    }

    return sprints;
  } catch {
    return [];
  }
}

async function safeSearch(
  jql: string,
  env: Env,
  auth: { accessToken: string; cloudId: string },
): Promise<JiraIssue[]> {
  try {
    return await searchIssues(jql, env, auth);
  } catch {
    return [];
  }
}
