import { loadTeamCapacity, totalCapacityHours } from "./capacity";
import { searchPages } from "./confluence";
import { generateExcel } from "./excel";
import { issuesByActiveSprint, issuesByFixVersion, searchIssues } from "./jira";
import { generatePlan, type PlannerInput } from "./planner";
import { formatPlanBlocks, postToResponseUrl, uploadFile } from "./slack";
import type { Env, PlanningJob } from "./types";

async function postError(responseUrl: string, message: string): Promise<void> {
  try {
    await postToResponseUrl(responseUrl, [], message);
  } catch (err) {
    console.error("Failed to post error to response_url:", err);
  }
}

async function processJob(job: PlanningJob, env: Env): Promise<void> {
  // 1. Fetch issues based on command type
  const issues = await (async () => {
    switch (job.command) {
      case "release":
        return issuesByFixVersion(job.args, env);
      case "sprint":
        return issuesByActiveSprint(env);
      case "jql":
        return searchIssues(job.args, env);
      default:
        throw new Error(`Unknown command: ${job.command}`);
    }
  })();

  // 2. Zero issues → error
  if (issues.length === 0) {
    await postToResponseUrl(job.response_url, [], "No issues found for the given query. Please check your parameters and try again.");
    return;
  }

  // 3. Fetch Confluence context (best-effort)
  const confluenceContext = await (async () => {
    try {
      const cql =
        job.command === "release"
          ? `text ~ "${job.args}" AND type = page`
          : `label = "planning" AND type = page`;
      return await searchPages(cql, env);
    } catch {
      return [];
    }
  })();

  // 4. Load team capacity
  const capacity = await loadTeamCapacity(job.team_config_name, env);

  // 5. Compute horizon dates
  const today = new Date();
  const from = job.flags.from ?? today.toISOString().slice(0, 10);
  const defaultDays = job.command === "sprint" ? capacity.sprint_length_days : 14;
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + defaultDays);
  const to = job.flags.to ?? toDate.toISOString().slice(0, 10);

  // 6. Build title
  const title = (() => {
    switch (job.command) {
      case "release": return `Release Plan: ${job.args}`;
      case "sprint": return "Sprint Plan";
      case "jql": return `Plan: ${job.args.slice(0, 50)}`;
      default: return "Delivery Plan";
    }
  })();

  // 7. Generate plan via OpenAI
  const plannerInput: PlannerInput = {
    issues,
    capacity,
    horizon: { from, to },
    confluenceContext,
    title,
  };

  const result = await generatePlan(plannerInput, env.OPENAI_API_KEY);

  // 8. Post Slack blocks
  const blocks = formatPlanBlocks(result);
  await postToResponseUrl(job.response_url, blocks, result.title);

  // 9. Generate & upload Excel
  const excelBuffer = generateExcel(result);
  const filename = `plan-${from}-${to}.xlsx`;
  await uploadFile(job.channel_id, filename, excelBuffer, env.SLACK_BOT_TOKEN);
}

export async function handleQueue(
  batch: MessageBatch<PlanningJob>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processJob(message.body, env);
      message.ack();
    } catch (err) {
      console.error("Queue processing error:", err);
      await postError(
        message.body.response_url,
        `An error occurred while generating your plan: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      message.retry();
    }
  }
}
