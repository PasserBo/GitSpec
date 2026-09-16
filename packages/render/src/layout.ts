import type { Document, SpaceResult } from "@gitspec/core";
import { withBase } from "./base.ts";

export interface NavItem {
    title: string;
    href: string;
    depth: number;
    group?: string;
    current: boolean;
}

function escape(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * N-1 when a SUMMARY.md exists, N-2 otherwise. The inferred form is deliberately plain:
 * path order with no grouping, because a space spanning unrelated trees has no ordering
 * to infer and pretending otherwise would put `src/` above `docs/` for no stated reason.
 */
export function buildNav(space: SpaceResult, current: Document, base = ""): NavItem[] {
    const byPath = new Map(space.documents.map((doc) => [doc.path, doc]));

    if (space.navigation.source === "summary") {
        const items: NavItem[] = [];
        for (const entry of space.navigation.entries) {
            const doc = byPath.get(entry.target);
            if (!doc) continue; // N-3: a SUMMARY entry pointing outside the space is not a page
            items.push({
                title: entry.title || String(doc.frontmatter.title ?? doc.id),
                href: withBase(base, doc.address),
                depth: entry.depth,
                group: entry.group,
                current: doc.path === current.path,
            });
        }
        // N-3: a document absent from SUMMARY.md is still served, so it is reachable by
        // address even though nothing links to it here.
        return items;
    }

    return space.documents.map((doc) => ({
        title: String(doc.frontmatter.title ?? doc.id),
        href: withBase(base, doc.address),
        depth: 0,
        current: doc.path === current.path,
    }));
}

function renderNav(items: NavItem[]): string {
    const out: string[] = [];
    let group: string | undefined;

    for (const item of items) {
        if (item.group !== group) {
            group = item.group;
            if (group) out.push(`<h2>${escape(group)}</h2>`);
        }
        const cls = item.current ? ' class="current"' : "";
        const indent = item.depth > 0 ? ` style="padding-left:${item.depth * 12 + 12}px"` : "";
        out.push(`<a href="${escape(item.href)}"${cls}${indent}>${escape(item.title)}</a>`);
    }

    return out.join("\n");
}

export const SITE_STYLE = `
:root { --fg:#1a1a1a; --muted:#6b6b6b; --rule:#e3e3e3; --accent:#0b5ed7; --bg:#fff; --code:#f6f6f6; }
@media (prefers-color-scheme: dark) {
  :root { --fg:#e6e6e6; --muted:#9a9a9a; --rule:#2c2c2c; --accent:#7aa7ff; --bg:#161616; --code:#1f1f1f; }
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
.shell { display:grid; grid-template-columns:260px minmax(0,1fr); max-width:1180px; margin:0 auto; }
nav { border-right:1px solid var(--rule); padding:28px 20px; position:sticky; top:0; align-self:start; max-height:100vh; overflow:auto; }
nav .site { font-weight:600; display:block; margin-bottom:20px; color:var(--fg); text-decoration:none; }
nav h2 { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin:22px 0 6px; }
nav a { display:block; padding:5px 12px; color:var(--muted); text-decoration:none; border-radius:5px; font-size:14px; }
nav a:hover { background:var(--code); color:var(--fg); }
nav a.current { color:var(--accent); font-weight:600; }
main { padding:40px 44px 96px; min-width:0; }
main :first-child { margin-top:0; }
h1,h2,h3 { line-height:1.3; margin-top:2em; }
a { color:var(--accent); }
code { background:var(--code); padding:.15em .35em; border-radius:4px; font-size:.9em; }
pre { background:var(--code); padding:14px 16px; border-radius:8px; overflow:auto; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; width:100%; margin:1.2em 0; display:block; overflow:auto; }
th,td { border:1px solid var(--rule); padding:7px 11px; text-align:left; font-size:14px; }
blockquote { margin:1.2em 0; padding-left:14px; border-left:3px solid var(--rule); color:var(--muted); }
hr { border:0; border-top:1px solid var(--rule); margin:2.4em 0; }
.meta { color:var(--muted); font-size:13px; border-bottom:1px solid var(--rule); padding-bottom:14px; margin-bottom:8px; }
nav .edit { margin-top:24px; font-size:13px; }
@media (max-width:860px) { .shell { grid-template-columns:1fr; } nav { position:static; max-height:none; border-right:0; border-bottom:1px solid var(--rule); } main { padding:28px 20px 72px; } }
`;

export function renderPage(args: {
    siteTitle: string;
    space: SpaceResult;
    document: Document;
    nav: NavItem[];
    content: string;
    base?: string;
    editHref?: string;
}): string {
    const { siteTitle, space, document, nav, content, base = "", editHref } = args;
    const title = String(document.frontmatter.title ?? document.id);
    const status = document.frontmatter.status;

    // The kind and status are shown because a reader's first question about a spec is
    // whether it is binding, and F-3 makes that answerable.
    const meta =
        document.kind === "spec"
            ? `<div class="meta">spec${status ? ` &middot; ${escape(String(status))}` : ""}</div>`
            : "";

    const edit = editHref
        ? `<a class="edit" href="${escape(editHref)}">Edit this page</a>`
        : "";

    return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} &middot; ${escape(siteTitle)}</title>
<style>${SITE_STYLE}</style>
<div class="shell">
<nav>
<a class="site" href="${escape(withBase(base, space.path))}">${escape(siteTitle)}</a>
${renderNav(nav)}
${edit}
</nav>
<main>
${meta}
${content}
</main>
</div>
`;
}
