import { handleQueue } from "./consumer";
import { routeRequest } from "./api/router";
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
} satisfies ExportedHandler<Env>;
