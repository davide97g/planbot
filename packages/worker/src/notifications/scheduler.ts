import type { Env, NotificationPreferences } from "../types";
import { buildDailyDigest } from "./digest";
import { sendSlackDM } from "./delivery";
import { checkSprintBoundaries } from "../sprint/lifecycle";

/**
 * Main scheduled handler — called by Cloudflare Cron Triggers.
 * Cron runs at 7, 8, 9 UTC on weekdays. For each user with notifications
 * enabled, we check if the current hour matches their preferred time in
 * their timezone.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const nowUtc = new Date();

  // List all notification preference keys
  const prefList = await env.PLANBOT_CONFIG.list({ prefix: "notifications:" });

  for (const key of prefList.keys) {
    try {
      const raw = await env.PLANBOT_CONFIG.get(key.name);
      if (!raw) continue;

      const prefs: NotificationPreferences = JSON.parse(raw);
      if (!prefs.enabled || !prefs.slackUserId) continue;

      const userId = key.name.replace("notifications:", "");

      // Check if now matches the user's preferred digest time
      if (prefs.dailyDigest.enabled) {
        const shouldSend = isTimeToSend(
          nowUtc,
          prefs.dailyDigest.time,
          prefs.dailyDigest.timezone,
        );

        if (shouldSend) {
          const digest = await buildDailyDigest(userId, env);
          if (digest) {
            await sendSlackDM(prefs.slackUserId, digest, env);
          }
        }
      }

      // Check sprint boundaries (reuses this cron)
      if (prefs.sprintAlerts.enabled) {
        await checkSprintBoundaries(userId, prefs, env);
      }

      // Risk alerts
      if (prefs.riskAlerts.enabled) {
        const { buildRiskAlerts } = await import("./digest");
        const riskMessage = await buildRiskAlerts(userId, prefs.riskAlerts.threshold, env);
        if (riskMessage) {
          await sendSlackDM(prefs.slackUserId, riskMessage, env);
        }
      }
    } catch (err) {
      console.error(`Notification error for ${key.name}:`, err);
    }
  }
}

/**
 * Check if the current UTC time matches the user's preferred local time.
 * We compare hour only — the cron fires at 7/8/9 UTC, and we match
 * whichever one corresponds to the user's preferred hour in their timezone.
 */
function isTimeToSend(
  nowUtc: Date,
  preferredTime: string,
  timezone: string,
): boolean {
  try {
    // Get the current hour in the user's timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    });
    const localHour = parseInt(formatter.format(nowUtc), 10);

    // Parse preferred time
    const [prefHour] = preferredTime.split(":").map(Number);

    return localHour === prefHour;
  } catch {
    return false;
  }
}
