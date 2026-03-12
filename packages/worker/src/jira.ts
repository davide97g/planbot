import type { Env, JiraIssue } from "./types";

const MAX_RESULTS = 100;
const MAX_ISSUES = 200;

function authHeader(env: Env): string {
  return "Basic " + btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);
}

interface JiraSearchResponse {
  issues: JiraRawIssue[];
  isLast: boolean;
}

interface JiraRawIssue {
  key: string;
  fields: {
    summary: string;
    assignee?: { displayName: string } | null;
    customfield_10016?: number | null;
    status: { name: string };
    issuetype: { name: string };
    priority: { name: string };
    fixVersions?: { name: string }[];
    sprint?: { name: string } | null;
    issuelinks?: JiraIssueLink[];
    labels?: string[];
    created: string;
    updated: string;
  };
}

interface JiraIssueLink {
  type: { name: string };
  outwardIssue?: { key: string };
  inwardIssue?: { key: string };
}

export function mapIssue(raw: JiraRawIssue): JiraIssue {
  const fields = raw.fields;

  const dependencies: string[] = [];
  for (const link of fields.issuelinks ?? []) {
    if (link.type.name === "Blocks") {
      if (link.outwardIssue) dependencies.push(link.outwardIssue.key);
      if (link.inwardIssue) dependencies.push(link.inwardIssue.key);
    }
  }

  return {
    key: raw.key,
    summary: fields.summary,
    assignee: fields.assignee?.displayName ?? null,
    storyPoints: fields.customfield_10016 ?? null,
    status: fields.status.name,
    issueType: fields.issuetype.name,
    priority: fields.priority.name,
    fixVersions: (fields.fixVersions ?? []).map((v) => v.name),
    sprint: fields.sprint?.name ?? null,
    dependencies,
    labels: fields.labels ?? [],
    created: fields.created,
    updated: fields.updated,
  };
}

export async function searchIssues(jql: string, env: Env): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let startAt = 0;

  const fields = [
    "summary", "assignee", "customfield_10016", "status", "issuetype",
    "priority", "fixVersions", "sprint", "issuelinks", "labels",
    "created", "updated",
  ];

  while (issues.length < MAX_ISSUES) {
    const url = new URL(`${env.JIRA_BASE_URL}/rest/api/3/search/jql`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(MAX_RESULTS));
    url.searchParams.set("fields", fields.join(","));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader(env),
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Jira search failed: ${res.status} ${await res.text()}`);
    }

    const data: JiraSearchResponse = await res.json();
    for (const raw of data.issues) {
      issues.push(mapIssue(raw));
    }

    if (data.isLast || data.issues.length === 0) {
      break;
    }

    startAt += data.issues.length;
  }

  return issues;
}

export function issuesByFixVersion(version: string, env: Env): Promise<JiraIssue[]> {
  return searchIssues(`fixVersion = "${version}"`, env);
}

export function issuesByActiveSprint(env: Env): Promise<JiraIssue[]> {
  return searchIssues("sprint in openSprints()", env);
}
