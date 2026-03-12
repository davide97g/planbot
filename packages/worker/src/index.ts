import { handleQueue } from "./consumer";
import { routeRequest } from "./api/router";
import { handleScheduled } from "./notifications/scheduler";
import type { Env, PlanningJob } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await routeRequest(request, env);
    } catch (err) {
      console.error("Unhandled error in fetch handler:", err);
      return Response.json(
        {
          response_type: "ephemeral",
          text: "Something went wrong. Please try again later.",
        },
        { status: 200 },
      );
    }
  },

  async queue(batch: MessageBatch<PlanningJob>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      await handleScheduled(env);
    } catch (err) {
      console.error("Scheduled handler error:", err);
    }
  },
} satisfies ExportedHandler<Env>;
