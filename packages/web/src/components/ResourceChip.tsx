import { XIcon, FileTextIcon } from "lucide-react";

const TYPE_STYLE: Record<string, string> = {
  S: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  B: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  T: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  ST: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  E: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/25",
  C: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25",
};

const TYPE_STYLE_ON_PRIMARY: Record<string, string> = {
  S: "bg-emerald-400/25 text-emerald-100 border-emerald-300/40",
  B: "bg-red-400/25 text-red-100 border-red-300/40",
  T: "bg-blue-400/25 text-blue-100 border-blue-300/40",
  ST: "bg-blue-400/25 text-blue-100 border-blue-300/40",
  E: "bg-purple-400/25 text-purple-100 border-purple-300/40",
  C: "bg-sky-400/25 text-sky-100 border-sky-300/40",
};

function getJiraTypeAbbrev(issueType: string): string {
  const lower = issueType.toLowerCase();
  if (lower === "story") return "S";
  if (lower === "bug") return "B";
  if (lower === "task") return "T";
  if (lower === "sub-task") return "ST";
  if (lower === "epic") return "E";
  return issueType.charAt(0).toUpperCase();
}

export interface TaggedResource {
  id: string;
  resourceType: "jira" | "confluence";
  /** Jira issue type (story, bug, etc.) — only for Jira resources */
  issueType?: string;
  display: string;
}

/** Encode a tagged resource as a text token for message content */
export function encodeResourceTag(resource: TaggedResource): string {
  if (resource.resourceType === "confluence") {
    return `[C:${resource.id}:${resource.display}]`;
  }
  return `[${getJiraTypeAbbrev(resource.issueType ?? "task")}:${resource.id}]`;
}

/** Parsed tag from message text */
export interface ParsedTag {
  abbrev: string;
  id: string;
  /** Title for Confluence pages */
  title?: string;
  raw: string;
}

/** Parse resource tags from message text: [S:BAT-3246] or [C:12345:Page Title] */
export function parseResourceTags(text: string): {
  tags: ParsedTag[];
  cleanText: string;
} {
  const tags: ParsedTag[] = [];

  // Jira tags: [S:BAT-3246]
  const jiraTagRegex = /\[([A-Z]{1,2}):([A-Z][A-Z0-9]+-\d+)\]/g;
  let match;
  while ((match = jiraTagRegex.exec(text)) !== null) {
    if (match[1] === "C") continue; // skip, handled by confluence regex
    tags.push({ abbrev: match[1], id: match[2], raw: match[0] });
  }

  // Confluence tags: [C:pageId:Page Title]
  const confluenceTagRegex = /\[C:(\d+):([^\]]+)\]/g;
  while ((match = confluenceTagRegex.exec(text)) !== null) {
    tags.push({ abbrev: "C", id: match[1], title: match[2], raw: match[0] });
  }

  let cleanText = text;
  for (const tag of tags) {
    cleanText = cleanText.replace(tag.raw, "");
  }
  cleanText = cleanText.trim();

  return { tags, cleanText };
}

interface ResourceChipProps {
  abbrev: string;
  id: string;
  /** Title to display (for Confluence chips) */
  title?: string;
  /** "default" for input area, "on-primary" for inside user bubble on dark bg */
  variant?: "default" | "on-primary";
  onRemove?: () => void;
}

export function ResourceChip({ abbrev, id, title, variant = "default", onRemove }: ResourceChipProps) {
  const styles = variant === "on-primary" ? TYPE_STYLE_ON_PRIMARY : TYPE_STYLE;
  const style = styles[abbrev] ?? (variant === "on-primary" ? "bg-white/20 text-white border-white/30" : "bg-muted text-muted-foreground border-border");

  const isConfluence = abbrev === "C";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${style}`}
    >
      {isConfluence ? (
        <>
          <FileTextIcon className="size-3 shrink-0" />
          <span className="truncate max-w-[150px]">{title ?? id}</span>
        </>
      ) : (
        <>
          <span className="font-bold">{abbrev}</span>
          <span className="text-[10px] opacity-50">:</span>
          <span className="font-mono">{id}</span>
        </>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-sm opacity-60 hover:opacity-100 transition-opacity"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}
