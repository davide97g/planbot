import React from "react";

interface MarkdownProps {
  content: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Chip styles for inline rendering (as HTML strings)
const JIRA_CHIP =
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 no-underline hover:bg-emerald-500/25 transition-colors cursor-pointer align-baseline';
const CONFLUENCE_CHIP =
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25 no-underline hover:bg-sky-500/25 transition-colors cursor-pointer align-baseline';

function renderInline(text: string): string {
  let result = escapeHtml(text);
  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(
    /(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/g,
    "<em>$1</em>"
  );
  // Inline code: `code`
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-muted px-1 py-0.5 text-sm font-mono">$1</code>'
  );
  // Links: [text](url) — detect Jira/Confluence URLs and render as chips
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, text: string, url: string) => {
      if (/\/browse\/[A-Z][A-Z0-9]+-\d+/.test(url)) {
        // Jira link → extract issue key
        const keyMatch = url.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/);
        const key = keyMatch ? keyMatch[1] : text;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${JIRA_CHIP}"><strong>S</strong><span style="font-size:10px;opacity:.5">:</span><span style="font-family:monospace">${escapeHtml(key)}</span></a>`;
      }
      if (/\/wiki\//.test(url) || /confluence/i.test(url)) {
        // Confluence link → chip with page icon
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${CONFLUENCE_CHIP}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg><span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(text)}</span></a>`;
      }
      // Regular link
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:text-primary/80 break-all">${escapeHtml(text)}</a>`;
    }
  );

  // Bare Jira issue keys: BAT-3314, PROJ-123 (not already inside a tag)
  // Must not match version strings like BAT-2026.02 (key followed by dot+digit)
  result = result.replace(
    /(?<![\/\w"=>])([A-Z][A-Z0-9]+-\d+)(?!\.\d)(?![^<]*>)(?!<\/)/g,
    (_match, key: string) => {
      return `<span class="${JIRA_CHIP}" style="display:inline-flex"><strong>S</strong><span style="font-size:10px;opacity:.5">:</span><span style="font-family:monospace">${key}</span></span>`;
    }
  );

  return result;
}

function parseMarkdown(content: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <div key={blocks.length} className="my-2">
          {lang && (
            <div className="rounded-t-md bg-muted/80 px-3 py-1 text-xs text-muted-foreground font-mono">
              {lang}
            </div>
          )}
          <pre
            className={`overflow-x-auto bg-muted/50 p-3 text-sm font-mono ${lang ? "rounded-b-md" : "rounded-md"}`}
          >
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Table: lines starting with | and containing |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableRows: string[][] = [];
      let hasHeader = false;
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        const row = lines[i].trim();
        // Check if this is a separator row (|---|---|)
        if (row.match(/^\|[\s\-:]+(\|[\s\-:]+)+\|$/)) {
          hasHeader = true;
          i++;
          continue;
        }
        const cells = row
          .slice(1, -1) // remove leading/trailing |
          .split("|")
          .map((c) => c.trim());
        tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        const headerRow = hasHeader ? tableRows[0] : null;
        const bodyRows = hasHeader ? tableRows.slice(1) : tableRows;
        blocks.push(
          <div key={blocks.length} className="my-2 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              {headerRow && (
                <thead>
                  <tr className="border-b-2 border-border">
                    {headerRow.map((cell, j) => (
                      <th
                        key={j}
                        className="px-3 py-1.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider"
                        dangerouslySetInnerHTML={{ __html: renderInline(cell) }}
                      />
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {bodyRows.map((row, j) => (
                  <tr key={j} className="border-b border-border/50">
                    {row.map((cell, k) => (
                      <td
                        key={k}
                        className="px-3 py-1.5"
                        dangerouslySetInnerHTML={{ __html: renderInline(cell) }}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizes: Record<number, string> = {
        1: "text-xl font-bold mt-4 mb-2",
        2: "text-lg font-semibold mt-3 mb-1.5",
        3: "text-base font-semibold mt-2 mb-1",
        4: "text-sm font-semibold mt-2 mb-1",
        5: "text-sm font-medium mt-1 mb-0.5",
        6: "text-xs font-medium mt-1 mb-0.5",
      };
      blocks.push(
        <div
          key={blocks.length}
          className={sizes[level]}
          dangerouslySetInnerHTML={{ __html: renderInline(text) }}
        />
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*+]\s/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*+]\s/)) {
        listItems.push(lines[i].replace(/^\s*[-*+]\s/, ""));
        i++;
      }
      blocks.push(
        <ul key={blocks.length} className="my-1 ml-4 list-disc space-y-0.5">
          {listItems.map((item, j) => (
            <li
              key={j}
              dangerouslySetInnerHTML={{ __html: renderInline(item) }}
            />
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s/, ""));
        i++;
      }
      blocks.push(
        <ol
          key={blocks.length}
          className="my-1 ml-4 list-decimal space-y-0.5"
        >
          {listItems.map((item, j) => (
            <li
              key={j}
              dangerouslySetInnerHTML={{ __html: renderInline(item) }}
            />
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={blocks.length}
          className="my-2 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground"
          dangerouslySetInnerHTML={{
            __html: quoteLines.map(renderInline).join("<br/>"),
          }}
        />
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      blocks.push(
        <hr key={blocks.length} className="my-3 border-border" />
      );
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p
        key={blocks.length}
        className="my-1"
        dangerouslySetInnerHTML={{ __html: renderInline(line) }}
      />
    );
    i++;
  }

  return blocks;
}

export function Markdown({ content }: MarkdownProps) {
  return <div className="leading-relaxed break-words">{parseMarkdown(content)}</div>;
}
