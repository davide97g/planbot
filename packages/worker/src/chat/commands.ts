import type { Agent } from "../types";
import {
  createPlanningAgent,
  createJiraAgent,
  createConfluenceAgent,
  createReportingAgent,
} from "../agents";

// ---------------------------------------------------------------------------
// Slash command parsing
// ---------------------------------------------------------------------------

export interface ParsedCommand {
  command: string;
  args: string;
}

/**
 * Parse a slash command from chat text.
 * Returns null if the text does not start with `/`.
 */
export function parseSlashCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { command: trimmed.slice(1).toLowerCase(), args: "" };
  }

  return {
    command: trimmed.slice(1, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

// ---------------------------------------------------------------------------
// Command → Agent mapping
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate agent for a slash command, or null for unknown commands.
 */
export function getAgentForCommand(command: string): Agent | null {
  switch (command) {
    case "plan":
      return createPlanningAgent();
    case "jira":
      return createJiraAgent();
    case "confluence":
      return createConfluenceAgent();
    case "report":
      return createReportingAgent();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

export function getHelpText(): string {
  return [
    "**Available commands:**",
    "",
    "`/plan <version>` — Plan all Jira issues for a fix version (e.g. `/plan V1.2`)",
    "`/jira <query>` — Search and analyze Jira issues",
    "`/confluence <search>` — Search Confluence documentation",
    "`/report <version> #channel` — Send a release recap to Slack (e.g. `/report V1.2 #releases`)",
    "`/help` — Show this help message",
    "",
    "**Mentions:**",
    "`@PROJ-123` — Reference a Jira issue",
    "`@confluence:page-title` — Reference a Confluence page",
    "",
    "You can also just type a message and the AI will figure out what you need!",
  ].join("\n");
}
