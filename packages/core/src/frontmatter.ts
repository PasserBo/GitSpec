import { parse as parseYaml } from "yaml";

/**
 * Editing frontmatter without reformatting it.
 *
 * `parseFrontmatter` in document.ts turns the block into an object and throws the source
 * away, which is all a renderer needs. An editor needs the opposite: a form that writes
 * one field back has to leave every other byte — key order, quoting style, comments,
 * blank lines — exactly as the author left it. Serialising the parsed object back would
 * reformat every file on its first save, which is the churn this project rejected
 * GitBook for.
 *
 * So this module locates each top-level key's span in the original text and replaces only
 * the spans that actually changed. Everything it cannot locate confidently it refuses,
 * and the editor falls back to editing the file as text (W-4).
 */

export type FrontmatterValue = string | number | boolean | null | string[];

export interface FrontmatterBlock {
    kind: "block";
    /** Offset of the opening fence, always 0, and of the first byte after the closing fence. */
    start: number;
    end: number;
    /** Where the document body begins. Equal to `end`. */
    bodyStart: number;
    /** Parsed values, for reading and for deciding whether an edit changes anything. */
    values: Record<string, unknown>;
    /** Top-level key to the span of source holding its whole entry, trailing newline included. */
    keys: Map<string, { start: number; end: number }>;
}

export type Located =
    /** No frontmatter at all. Common: F-6 makes `page` the default, and pages often have none. */
    | { kind: "absent" }
    /** Present, but not safely editable key by key. The reason is shown to the author. */
    | { kind: "opaque"; reason: string }
    | FrontmatterBlock;

/**
 * What counts as a frontmatter block, shared with `parseFrontmatter` so that reading and
 * editing can never disagree about where one ends. The inner group is optional so that
 * `---\n---\n` is an empty block; without that, setting a field on such a file would
 * append a second block below the first.
 */
export const FRONTMATTER_FENCE = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)/;
const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_-]*):(\s|$)/;

export function locateFrontmatter(source: string): Located {
    const match = FRONTMATTER_FENCE.exec(source);
    if (!match) return { kind: "absent" };

    const raw = match[1] ?? "";
    // FENCE anchors on `---\r?\n`, so the first newline in the source ends the opening fence.
    const rawStart = source.indexOf("\n") + 1;
    const rawEnd = rawStart + raw.length;

    const scan = scanKeys(raw, rawStart, rawEnd);
    if (scan.duplicate) return { kind: "opaque", reason: "a key appears more than once" };

    let parsed: unknown;
    try {
        parsed = parseYaml(raw);
    } catch {
        return { kind: "opaque", reason: "its YAML could not be parsed" };
    }
    // `---\n---\n` is an empty block, not a broken one.
    if (parsed === null || parsed === undefined) parsed = {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
        return { kind: "opaque", reason: "it is not a mapping of keys to values" };
    }
    const values = parsed as Record<string, unknown>;

    const keys = scan.keys;

    // The fidelity guard. If the parser found a key the line scan did not — a flow
    // mapping, a quoted key, a merge key, an anchor — then the scan does not understand
    // this block well enough to edit one field of it without risking the rest.
    const named = Object.keys(values);
    if (named.length !== keys.size || named.some((key) => !keys.has(key))) {
        return { kind: "opaque", reason: "it uses YAML this editor cannot edit key by key" };
    }

    return {
        kind: "block",
        start: 0,
        end: match[0].length,
        bodyStart: match[0].length,
        values,
        keys,
    };
}


function scanKeys(
    raw: string,
    rawStart: number,
    rawEnd: number,
): { keys: Map<string, { start: number; end: number }>; duplicate: boolean } {
    const keys = new Map<string, { start: number; end: number }>();
    let current: { key: string; start: number } | undefined;
    let duplicate = false;
    let offset = rawStart;

    for (const line of raw.split("\n")) {
        const found = KEY_LINE.exec(line);
        if (found) {
            const key = found[1]!;
            if (current) keys.set(current.key, { start: current.start, end: offset });
            if (keys.has(key)) duplicate = true;
            current = { key, start: offset };
        }
        offset += line.length + 1;
    }
    if (current) keys.set(current.key, { start: current.start, end: rawEnd });

    return { keys, duplicate };
}

/** Everything after the frontmatter. The whole file when there is none. */
export function readBody(source: string): string {
    const located = locateFrontmatter(source);
    return located.kind === "block" ? source.slice(located.bodyStart) : source;
}

/** Swap the body, leaving the frontmatter block byte-identical. */
export function replaceBody(source: string, body: string): string {
    const located = locateFrontmatter(source);
    return located.kind === "block" ? source.slice(0, located.bodyStart) + body : body;
}

/**
 * Rewrite only the keys whose value actually changes.
 *
 * An edit whose value already matches what the file says is dropped before anything is
 * written, so passing the whole form back — which is what a form does — cannot rewrite a
 * field the author never touched. A key mapped to `undefined` is removed. A key that is
 * not there yet is appended at the end of the block.
 */
export function spliceFrontmatter(
    source: string,
    edits: Record<string, FrontmatterValue | undefined>,
): string {
    const located = locateFrontmatter(source);
    if (located.kind === "opaque") {
        throw new Error(`this document's frontmatter cannot be edited field by field: ${located.reason}`);
    }
    if (located.kind === "absent") return createBlock(source, edits);

    const changed = Object.entries(edits).filter(([key, value]) => !same(located.values[key], value));
    if (changed.length === 0) return source;

    let result = source;
    const appended: string[] = [];

    // Existing keys are replaced from the end backwards, so an earlier span's offsets are
    // still valid when it is reached.
    const spans = changed
        .filter(([key]) => located.keys.has(key))
        .map(([key, value]) => ({ key, value, span: located.keys.get(key)! }))
        .sort((a, b) => b.span.start - a.span.start);

    for (const { key, value, span } of spans) {
        const original = source.slice(span.start, span.end);
        const newline = original.endsWith("\n") ? "\n" : "";
        // The last entry in a block carries no trailing newline, so deleting it would
        // leave the newline that preceded it and a blank line before the closing fence.
        const from = value === undefined && !newline && result[span.start - 1] === "\n" ? span.start - 1 : span.start;
        const replacement = value === undefined ? "" : emit(key, value) + newline;
        result = result.slice(0, from) + replacement + result.slice(span.end);
    }

    for (const [key, value] of changed) {
        if (!located.keys.has(key) && value !== undefined) appended.push(emit(key, value));
    }
    if (appended.length > 0) {
        // Before the closing fence, which is the last `---` of the block.
        const relocated = locateFrontmatter(result);
        if (relocated.kind !== "block") throw new Error("frontmatter became unreadable while editing it");
        const closing = result.lastIndexOf("---", relocated.end);
        result = result.slice(0, closing) + appended.join("\n") + "\n" + result.slice(closing);
    }

    return result;
}

function createBlock(source: string, edits: Record<string, FrontmatterValue | undefined>): string {
    const lines = Object.entries(edits)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => emit(key, value as FrontmatterValue));
    return lines.length === 0 ? source : `---\n${lines.join("\n")}\n---\n\n${source.replace(/^\n+/, "")}`;
}

function same(current: unknown, next: FrontmatterValue | undefined): boolean {
    if (next === undefined) return current === undefined;
    if (Array.isArray(next)) {
        return (
            Array.isArray(current) &&
            current.length === next.length &&
            current.every((item, i) => item === next[i])
        );
    }
    return current === next;
}

function emit(key: string, value: FrontmatterValue): string {
    if (Array.isArray(value)) {
        return value.length === 0 ? `${key}: []` : `${key}:\n${value.map((v) => `  - ${scalar(v)}`).join("\n")}`;
    }
    return `${key}: ${scalar(value)}`;
}

function scalar(value: string | number | boolean | null): string {
    if (value === null) return "null";
    if (typeof value !== "string") return String(value);
    return needsQuoting(value) ? JSON.stringify(value) : value;
}

/**
 * Whether a string would be read back as something other than itself.
 *
 * `yaml` writes and reads the YAML 1.2 core schema, where `yes` and `no` are plain
 * strings, so the 1.1 boolean words are deliberately not listed here. `@` is: it is a
 * reserved indicator, which is why the specs write `owner: "@PasserBo"`.
 */
function needsQuoting(value: string): boolean {
    if (value === "") return true;
    if (/^\s|\s$/.test(value)) return true;
    if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
    if (/:\s|\s#/.test(value)) return true;
    if (/^(null|true|false|~)$/i.test(value)) return true;
    if (/^[-+]?(\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|\.\d+|0x[\dA-Fa-f]+|0o[0-7]+|\.(inf|nan))$/i.test(value)) {
        return true;
    }
    return false;
}
