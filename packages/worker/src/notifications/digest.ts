import type { Env, JiraIssue } from "../types";
import { searchIssues } from "../jira";
import { getAtlassianAccessToken } from "../api/atlassian-oauth";

/**
 * Build the daily digest message for a user.
 * Returns a Slack mrkdwn-formatted string, or null if there's nothing to report.
 */
export async function buildDailyDigest(
  userId: string,
  env: Env,
): Promise<string | null> {
  let auth: { accessToken: string; cloudId: string };
  try {
    auth = await getAtlassianAccessToken(userId, env);
  } catch {
    return null; // User hasn't connected Atlassian
  }

  const today = new Date().toISOString().slice(0, 10);
  const threeDaysFromNow = new Date(Date.now() + 3 * 86400000)
    .toISOString()
    .slice(0, 10);

  // Fetch issues that changed status recently (last 24h)
  const recentlyChanged = await safeSearch(
    `assignee = currentUser() AND status changed AFTER -1d ORDER BY updated DESC`,
    env,
    auth,
  );

  // Fetch blockers in active sprint
  const blockers = await safeSearch(
    `sprint in openSprints() AND (status = "Blocked" OR statusCategory = "Blocked") ORDER BY priority DESC`,
    env,
    auth,
  );

  // Fetch issues due in next 3 days
  const upcoming = await safeSearch(
    `assignee = currentUser() AND duedate >= "${today}" AND duedate <= "${threeDaysFromNow}" AND statusCategory != "Done" ORDER BY duedate ASC`,
    env,
    auth,
  );

  // If nothing to report, skip
  if (
    recentlyChanged.length === 0 &&
    blockers.length === 0 &&
    upcoming.length === 0
  ) {
    return null;
  }

  const sections: string[] = [];
  sections.push(`:sunrise: *Daily Digest — ${today}*`);

  if (recentlyChanged.length > 0) {
    sections.push(
      `\n*Status Changes (last 24h):*\n` +
        recentlyChanged
          .slice(0, 10)
          .map((i) => `• *${i.key}* — ${i.summary} → _${i.status}_`)
          .join("\n"),
    );
  }

  if (blockers.length > 0) {
    sections.push(
      `\n:no_entry: *Active Blockers:*\n` +
        blockers
          .slice(0, 5)
          .map((i) => `• *${i.key}* — ${i.summary} (${i.assignee ?? "unassigned"})`)
          .join("\n"),
    );
  }

  if (upcoming.length > 0) {
    sections.push(
      `\n:calendar: *Due in Next 3 Days:*\n` +
        upcoming
          .slice(0, 10)
          .map((i) => `• *${i.key}* — ${i.summary}`)
          .join("\n"),
    );
  }

  return sections.join("\n");
}

/**
 * Build risk alert message. Checks for blocked issues, past-due issues,
 * and unassigned issues in the active sprint.
 */
export async function buildRiskAlerts(
  userId: string,
  threshold: "high" | "medium" | "low",
  env: Env,
): Promise<string | null> {
  let auth: { accessToken: string; cloudId: string };
  try {
    auth = await getAtlassianAccessToken(userId, env);
  } catch {
    return null;
  }

  const risks: string[] = [];

  // Blocked issues
  const blocked = await safeSearch(
    `sprint in openSprints() AND (status = "Blocked" OR statusCategory = "Blocked")`,
    env,
    auth,
  );
  if (blocked.length > 0) {
    risks.push(
      `:no_entry: *${blocked.length} blocked issue(s)*\n` +
        blocked
          .slice(0, 5)
          .map((i) => `• *${i.key}* — ${i.summary}`)
          .join("\n"),
    );
  }

  // Past-due issues
  const today = new Date().toISOString().slice(0, 10);
  const overdue = await safeSearch(
    `sprint in openSprints() AND duedate < "${today}" AND statusCategory != "Done"`,
    env,
    auth,
  );
  if (overdue.length > 0) {
    risks.push(
      `:warning: *${overdue.length} overdue issue(s)*\n` +
        overdue
          .slice(0, 5)
          .map((i) => `• *${i.key}* — ${i.summary}`)
          .join("\n"),
    );
  }

  // Unassigned issues in active sprint
  const unassigned = await safeSearch(
    `sprint in openSprints() AND assignee is EMPTY AND statusCategory != "Done"`,
    env,
    auth,
  );
  if (unassigned.length > 0 && (threshold === "medium" || threshold === "low")) {
    risks.push(
      `:question: *${unassigned.length} unassigned issue(s) in sprint*\n` +
        unassigned
          .slice(0, 5)
          .map((i) => `• *${i.key}* — ${i.summary}`)
          .join("\n"),
    );
  }

  // Apply threshold
  const minRisks = threshold === "high" ? 1 : threshold === "medium" ? 1 : 1;
  if (risks.length < minRisks) return null;

  return `:rotating_light: *Sprint Risk Alert*\n\n${risks.join("\n\n")}`;
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
