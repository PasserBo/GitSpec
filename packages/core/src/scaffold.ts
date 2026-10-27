import { posix } from "node:path";
import { deriveId } from "./document.ts";
import { parseSummary } from "./navigation.ts";
import { SPEC_SCHEMA, type Field } from "./schema.ts";
import type { DocumentKind } from "./document.ts";

/**
 * Starting a document.
 *
 * Everything this product does operated on documents that already existed. Creating one
 * meant writing seven frontmatter keys from memory, getting three section headings right
 * in order, picking an id nothing would collide with, and remembering to add a line to a
 * navigation file — and then finding out what was wrong from a pull request review. For
 * an agent, which has no memory of the format between tasks, that is the step most
 * likely to produce something the checker rejects.
 *
 * So a new document is generated from `SPEC_SCHEMA`, the same value the form and the
 * checker read, and it is born passing. Nothing here invents a convention: where a spec
 * goes is read from where this repository's specs already are.
 */

export interface NewDocument {
    /** Repository-root-relative path to write. */
    path: string;
    contents: string;
    id: string;
    title: string;
}

export interface NewDocumentInput {
    title: string;
    kind?: DocumentKind;
    /** Defaults to a slug of the title. */
    id?: string;
    owner?: string;
    /** Today, as YYYY-MM-DD, only used for a document that still carries dates. */
    directory: string;
}

/**
 * Where a new document of this kind belongs, learned from where the existing ones are.
 *
 * A repository that keeps its specs in `docs/specs` gets another one there; a repository
 * that keeps them flat in `docs` does not suddenly grow a subdirectory. Only when there
 * is nothing to learn from does a convention get chosen, and then it is the obvious one.
 */
export function directoryFor(
    kind: DocumentKind,
    spaceDirectory: string,
    existing: { path: string; kind: DocumentKind }[],
): string {
    const space = spaceDirectory.replace(/^\.\//, "").replace(/\/$/, "");
    const sameKind = existing.filter((d) => d.kind === kind && d.path.startsWith(`${space}/`));

    // The directory the most documents of this kind already live in.
    const counts = new Map<string, number>();
    for (const { path } of sameKind) {
        const dir = posix.dirname(path);
        counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
    const best = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best) return best[0];

    return kind === "spec" ? `${space}/specs` : space;
}

export function newDocument(input: NewDocumentInput): NewDocument {
    const kind = input.kind ?? "spec";
    const id = input.id?.trim() || deriveId(input.title);
    const path = posix.join(input.directory, `${id}.md`);

    if (kind === "page") {
        return {
            path,
            id,
            title: input.title,
            contents: `---\nkind: page\nid: ${id}\ntitle: ${quote(input.title)}\n---\n\n# ${input.title}\n\n`,
        };
    }

    const values: Record<string, string> = {
        kind: "spec",
        id,
        title: quote(input.title),
        status: "draft",
        owner: quote(input.owner?.trim() || "@unassigned"),
        governs: "[]",
        verified_against: "null",
    };

    // F-1's order, taken from the schema rather than retyped, so a key added there
    // appears here without anyone remembering to.
    const frontmatter = SPEC_SCHEMA.map((field: Field) => `${field.key}: ${values[field.key] ?? "null"}`).join("\n");

    // Born passing: S-1's three sections in order, and no bullet in `Behaviour`, because
    // a placeholder bullet without an identifier would fail C-1 on the first run.
    const contents = `---
${frontmatter}
---

# ${input.title}

## Intent

Why this exists, and what it costs. Prose here is never drift-checked, so this is the
place for reasoning that has no truth value against code.

## Behaviour

Write each rule as a claim: a bullet whose identifier is bold at the start of the line,
as \`- **${prefixFor(input.title)}-1** — …\`. An identifier is permanent, so pick one and keep it.
Anything that cannot be contradicted by a change to the code belongs in Intent instead.

## Open questions

What is undecided, and what this document knowingly does not cover.
`;

    return { path, id, title: input.title, contents };
}

/** Initials, so a new spec suggests an identifier prefix rather than leaving it blank. */
function prefixFor(title: string): string {
    const words = title.split(/[^A-Za-z]+/).filter(Boolean);
    const initials = words.map((w) => w[0]!.toUpperCase()).join("");
    return (initials || "X").slice(0, 2);
}

function quote(value: string): string {
    return /^[A-Za-z][A-Za-z0-9 ._-]*$/.test(value) ? value : JSON.stringify(value);
}

/**
 * The navigation line for a document, placed where its neighbours are.
 *
 * N-4 used to say GitSpec never writes this file at all. It was the right rule when every
 * document was written by a person who would remember; it is the wrong one now, because
 * a document absent from the navigation is served and invisible (N-3), which is the
 * quietest way to lose work. The rule is now about *when*: the entry arrives in the same
 * change as the document it points at, where review can see it, and never on its own.
 */
export function withSummaryEntry(
    summaryPath: string,
    summary: string,
    document: { path: string; title: string },
): string | undefined {
    const entries = parseSummary(summaryPath, summary);
    if (entries.some((e) => e.target === document.path)) return undefined;

    const summaryDir = posix.dirname(summaryPath);
    const relative = posix.relative(summaryDir, document.path);
    const line = `* [${document.title}](${relative})`;

    const lines = summary.split("\n");
    const documentDir = posix.dirname(document.path);

    // After the last entry that lives in the same directory, so a new spec joins the
    // specs rather than landing under whatever heading happens to be last.
    let at = -1;
    for (const [index, text] of lines.entries()) {
        const match = /^\s*[*+-]\s+\[[^\]]*\]\(([^)\s]+)/.exec(text);
        if (!match) continue;
        const target = posix.normalize(posix.join(summaryDir, match[1]!));
        if (posix.dirname(target) === documentDir) at = index;
    }
    if (at === -1) {
        // Nothing to sit beside: after the last entry anywhere, or at the end.
        for (const [index, text] of lines.entries()) {
            if (/^\s*[*+-]\s+\[[^\]]*\]\(/.test(text)) at = index;
        }
    }

    if (at === -1) {
        const trimmed = summary.replace(/\n+$/, "");
        return `${trimmed}\n\n${line}\n`;
    }
    lines.splice(at + 1, 0, line);
    return lines.join("\n");
}
