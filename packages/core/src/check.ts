import { locateFrontmatter } from "./frontmatter.ts";
import { schemaFor, validateFrontmatter } from "./schema.ts";
import type { Document, DocumentKind } from "./document.ts";

/**
 * Whether a document keeps the rules its own format states.
 *
 * Every rule here was already written down and enforced by nobody. F-1 listed the
 * frontmatter keys, S-1 fixed the three sections, C-1 and C-2 fixed how a claim is
 * identified — and the only code that read any of it was a form in a browser, which a
 * repository's own author never opens and an agent cannot reach at all. A spec that
 * broke its own format merged into this repository and survived eight commits.
 *
 * So the rules live here, as pure functions over text, and three callers share them: the
 * command an author or an agent runs before committing, the workflow that runs it again
 * on the pull request, and the editor, which shows the same verdict while someone is
 * typing. One definition, because three would disagree within a month.
 *
 * Nothing here throws and nothing blocks. A finding is a report, and whether a report
 * stops a merge is the repository's own setting to make through branch protection.
 */

export interface Finding {
    /** Repository-root-relative path of the document the finding is about. */
    path: string;
    /** The claim being broken, so a complaint can be looked up rather than guessed at. */
    rule: string;
    message: string;
    /** 1-indexed line, when the rule knows where. */
    line?: number;
    /** The frontmatter key at fault, when the finding is about one. Lets a form show it. */
    key?: string;
    severity: "error" | "warning";
}

const SECTIONS = ["Intent", "Behaviour", "Open questions"];
const CLAIM = /^-\s+\*\*([A-Z][A-Z0-9]*-\d+)\*\*/;
const HEADING = /^(#{1,6})\s+(.*?)\s*$/;

export interface Claim {
    /** The permanent identifier C-2 promises never moves, e.g. `F-3`. */
    id: string;
    /** The statement, without its identifier. */
    text: string;
    /** 1-indexed line in the document it was read from. */
    line: number;
}

/**
 * Every claim in a document's `Behaviour` section.
 *
 * This is the only place that decides what counts as one, because the checker and
 * anything that lists them have to agree: a nested bullet is part of the claim above it,
 * a bullet in a fenced example is not a claim at all, and neither is a bullet anywhere
 * but `Behaviour` (S-2).
 */
export function claimsIn(source: string): Claim[] {
    return behaviourBullets(source).filter((b): b is Claim => b.id !== undefined) as Claim[];
}

/**
 * Every top-level bullet in `Behaviour`, identified or not.
 *
 * The checker wants the ones without an identifier and the index wants the ones with, so
 * there is one scanner rather than two that would disagree about a nested bullet inside
 * a month.
 */
export function behaviourBullets(source: string): { id?: string; text: string; line: number }[] {
    const located = locateFrontmatter(source);
    const starts = lineStarts(source);
    const bodyLine = lineAt(starts, located.bodyStart);
    const lines = source.slice(located.bodyStart).split("\n");

    const found: { id?: string; text: string; line: number }[] = [];
    let inBehaviour = false;
    let fenced = false;

    for (const [index, line] of lines.entries()) {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        if (fenced) continue;

        const heading = HEADING.exec(line);
        if (heading && heading[1]!.length === 2) {
            inBehaviour = heading[2] === "Behaviour";
            continue;
        }
        // Only a top-level bullet is a claim; a nested one is part of the claim above it.
        if (!inBehaviour || !/^-\s+\S/.test(line)) continue;

        const match = CLAIM.exec(line);
        found.push({
            id: match?.[1],
            text: match ? line.slice(match[0].length).replace(/^\s*[\u2014\u2013-]\s*/, "").trim() : line.slice(2).trim(),
            line: bodyLine + index,
        });
    }

    return found;
}

/** A line-start offset table, so a character offset can be reported as a line. */
function lineStarts(source: string): number[] {
    const starts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
    return starts;
}

function lineAt(starts: number[], offset: number): number {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (starts[mid]! <= offset) low = mid;
        else high = mid - 1;
    }
    return low + 1;
}

/**
 * One document, judged on its own.
 *
 * Deliberately free of the filesystem and of every other document, so the editor can run
 * it against unsaved text while someone is still typing.
 */
export function checkDocument(path: string, source: string, kind: DocumentKind): Finding[] {
    const findings: Finding[] = [];
    const at = (line?: number) => line;
    const starts = lineStarts(source);
    const located = locateFrontmatter(source);

    const add = (
        rule: string,
        message: string,
        line?: number,
        severity: Finding["severity"] = "error",
        key?: string,
    ) => findings.push({ path, rule, message, line: at(line), key, severity });

    // ---- frontmatter ------------------------------------------------------

    if (located.kind === "opaque") {
        add("F-1", `the frontmatter cannot be read: ${located.reason}`, 1);
        return findings;
    }

    const values = located.kind === "block" ? located.values : {};
    if (kind === "spec" && located.kind === "absent") {
        add("F-1", "a spec begins with YAML frontmatter, and this document has none", 1);
    }

    for (const issue of validateFrontmatter(schemaFor(kind), values)) {
        const span = located.kind === "block" ? located.keys.get(issue.key) : undefined;
        add(issue.rule, issue.message, span ? lineAt(starts, span.start) : 1, "error", issue.key);
    }

    // Everything below is about the body of a spec. F-6 exempts a page from all of it.
    if (kind !== "spec") return findings;

    const bodyStart = located.bodyStart;
    const body = source.slice(bodyStart);
    const lines = body.split("\n");
    const lineOf = (index: number) => lineAt(starts, bodyStart) + index;

    // ---- structure (S-1) --------------------------------------------------

    const headings: { depth: number; text: string; index: number }[] = [];
    let fenced = false;
    for (const [index, line] of lines.entries()) {
        // A `## Behaviour` inside a code block is an example, not a section.
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        if (fenced) continue;
        const match = HEADING.exec(line);
        if (match) headings.push({ depth: match[1]!.length, text: match[2]!, index });
    }

    const topLevel = headings.filter((h) => h.depth === 2);
    const names = topLevel.map((h) => h.text);
    if (names.join("|") !== SECTIONS.join("|")) {
        const missing = SECTIONS.filter((s) => !names.includes(s));
        const extra = names.filter((n) => !SECTIONS.includes(n));
        const detail = [
            missing.length > 0 ? `missing ${missing.map((s) => `\`${s}\``).join(", ")}` : "",
            extra.length > 0 ? `unexpected ${extra.map((s) => `\`${s}\``).join(", ")}` : "",
            missing.length === 0 && extra.length === 0 ? "out of order" : "",
        ]
            .filter(Boolean)
            .join("; ");
        add(
            "S-1",
            `a spec has exactly \`Intent\`, \`Behaviour\` and \`Open questions\` as its top-level sections, in that order: ${detail}`,
            topLevel[0] ? lineOf(topLevel[0].index) : 1,
        );
    }

    // ---- claims (C-1, C-2) ------------------------------------------------

    if (!topLevel.some((h) => h.text === "Behaviour")) return findings;

    const seen = new Map<string, number>();
    for (const bullet of behaviourBullets(source)) {
        if (!bullet.id) {
            add(
                "C-1",
                "every statement in `Behaviour` is a claim and carries an identifier in bold at the start of the line, as `- **PREFIX-1** — …`",
                bullet.line,
            );
            continue;
        }
        const earlier = seen.get(bullet.id);
        if (earlier !== undefined) {
            add(
                "C-2",
                `\`${bullet.id}\` is already used on line ${earlier}; an identifier is unique within its spec and is never reused`,
                bullet.line,
            );
        } else {
            seen.set(bullet.id, bullet.line);
        }
    }

    return findings;
}

export interface RepositoryCheck {
    /** Every document discovered, with the text it was read as. */
    documents: { document: Document; source: string }[];
    /** Repository-root-relative paths of every file, for resolving what a link points at. */
    files: Set<string>;
}

/**
 * The whole repository, including what only makes sense across documents.
 *
 * A duplicate id and a link to nothing are both invisible from inside a single file, and
 * both are the failure an agent makes most: it writes a document that already exists, or
 * points at one it believes exists.
 */
export function checkRepository(input: RepositoryCheck): Finding[] {
    const findings: Finding[] = [];
    for (const { document, source } of input.documents) {
        findings.push(...checkDocument(document.path, source, document.kind));
    }

    // ---- identity (A-2) ---------------------------------------------------

    const byId = new Map<string, string[]>();
    for (const { document } of input.documents) {
        if (document.idDerived) continue; // A-4: a derived id is the path, and paths are unique.
        byId.set(document.id, [...(byId.get(document.id) ?? []), document.path]);
    }
    for (const [id, paths] of byId) {
        if (paths.length < 2) continue;
        for (const path of paths) {
            findings.push({
                path,
                rule: "A-2",
                message: `the id \`${id}\` is also declared by ${paths.filter((p) => p !== path).map((p) => `\`${p}\``).join(", ")}; an id is unique across the repository`,
                line: 1,
                severity: "error",
            });
        }
    }

    // ---- links ------------------------------------------------------------

    const documentPaths = new Set(input.documents.map((d) => d.document.path));
    for (const { document, source } of input.documents) {
        for (const { target, line, raw } of linksIn(source, document.path)) {
            if (documentPaths.has(target) || input.files.has(target)) continue;
            findings.push({
                path: document.path,
                rule: "R-5",
                message: `\`${raw}\` points at \`${target}\`, which is not in the repository`,
                line,
                severity: "warning",
            });
        }
    }

    return findings;
}

const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Code blanked out, offsets preserved.
 *
 * A spec about links is full of links that are examples — the assets spec opens by
 * quoting `![](./shot.png)` to describe the bug it fixes. Reporting those as broken
 * would make the checker loudest about the documents that explain it, which is the
 * fastest way to teach someone to ignore a tool.
 */
function maskCode(source: string): string {
    const out = source.split("");
    const blank = (from: number, to: number) => {
        for (let i = from; i < to && i < out.length; i++) if (out[i] !== "\n") out[i] = " ";
    };

    for (const match of source.matchAll(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm)) {
        blank(match.index, match.index + match[0].length);
    }
    // Inline code, longest run of backticks first so ``a `b` c`` is one span.
    for (const match of source.matchAll(/(`+)(?:(?!\1)[\s\S])*?\1/g)) {
        blank(match.index, match.index + match[0].length);
    }
    return out.join("");
}

/** Relative link targets, resolved against the document's own directory. */
function linksIn(source: string, fromPath: string): { target: string; line: number; raw: string }[] {
    const starts = lineStarts(source);
    const out: { target: string; line: number; raw: string }[] = [];
    const directory = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";

    for (const match of maskCode(source).matchAll(LINK)) {
        const raw = match[1]!;
        // External, site-absolute and fragment-only links are somebody else's to keep.
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || raw.startsWith("#") || raw.startsWith("/")) {
            continue;
        }
        const [pathPart = ""] = raw.split("#");
        if (!pathPart) continue;
        out.push({
            target: normalize(directory ? `${directory}/${pathPart}` : pathPart),
            line: lineAt(starts, match.index),
            raw,
        });
    }
    return out;
}

function normalize(path: string): string {
    const parts: string[] = [];
    for (const part of path.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
    }
    return parts.join("/");
}

/** Errors first, then by file and line, so the first line of output is the one to fix. */
export function sortFindings(findings: Finding[]): Finding[] {
    const rank = (f: Finding) => (f.severity === "error" ? 0 : 1);
    return [...findings].sort(
        (a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0),
    );
}
