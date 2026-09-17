import type { DocumentKind } from "./document.ts";

/**
 * The spec format, as one value.
 *
 * `docs/specs/spec-format.md` already fixes every rule below in prose: which keys exist
 * (F-1), what `kind` may be (F-6), what `status` may be (F-3), that `governs` is a list
 * of globs (F-4) and that `verified_against` is a sha or null (F-5). Until now nothing
 * read any of it, so an editor could — and did — write a document its own format forbids.
 *
 * Writing it once, here, means the form an author fills in, the validation that judges a
 * document, and the shape an agent is told to produce are the same definition rather
 * than three drifting copies of it. Each field carries the claim it exists to satisfy,
 * so a complaint can always say which rule it comes from.
 */

export type FieldType =
    | { kind: "text" }
    | { kind: "enum"; values: readonly string[] }
    | { kind: "date" }
    /** A list of repository-root-relative path globs. */
    | { kind: "paths" }
    /** A commit sha, or null for "never verified". */
    | { kind: "shaOrNull" };

export interface Field {
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    /** The claim this field exists to satisfy. */
    rule: string;
    /** Shown beside the field. Says what the value is for, not what type it is. */
    help?: string;
}

export const SPEC_SCHEMA: readonly Field[] = [
    {
        key: "kind",
        label: "Kind",
        type: { kind: "enum", values: ["spec", "page"] },
        required: true,
        rule: "F-6",
        help: "Only a spec is ever drift-checked. A page is subject to none of the rules below.",
    },
    {
        key: "id",
        label: "Identifier",
        type: { kind: "text" },
        required: true,
        rule: "F-2",
        help: "Unique across the repository, and independent of the file path, so the document can move without breaking references to it.",
    },
    { key: "title", label: "Title", type: { kind: "text" }, required: true, rule: "F-1" },
    {
        key: "status",
        label: "Status",
        type: { kind: "enum", values: ["draft", "active", "superseded"] },
        required: true,
        rule: "F-3",
        help: "Only an active spec is drift-checked.",
    },
    {
        key: "owner",
        label: "Owner",
        type: { kind: "text" },
        required: true,
        rule: "F-1",
        help: "Who answers questions about this document.",
    },
    { key: "created", label: "Created", type: { kind: "date" }, required: true, rule: "F-1" },
    { key: "updated", label: "Updated", type: { kind: "date" }, required: true, rule: "F-1" },
    {
        key: "governs",
        label: "Governs",
        type: { kind: "paths" },
        required: true,
        rule: "F-4",
        help: "Path globs naming the code this spec describes. An empty list means it governs no code and is never drift-checked.",
    },
    {
        key: "verified_against",
        label: "Verified against",
        type: { kind: "shaOrNull" },
        required: true,
        rule: "F-5",
        help: "The commit at which a human last confirmed this spec matched the code, or empty if that has never happened.",
    },
];

/**
 * F-6: a page is subject to no rule beyond having an id, and even that may be derived
 * from its path (A-4). So every field here is optional, and unknown keys are allowed —
 * a page in a repository GitSpec did not write may carry anything at all.
 */
export const PAGE_SCHEMA: readonly Field[] = [
    { key: "kind", label: "Kind", type: { kind: "enum", values: ["spec", "page"] }, required: false, rule: "F-6" },
    { key: "id", label: "Identifier", type: { kind: "text" }, required: false, rule: "F-2" },
    { key: "title", label: "Title", type: { kind: "text" }, required: false, rule: "F-1" },
];

export function schemaFor(kind: DocumentKind): readonly Field[] {
    return kind === "spec" ? SPEC_SCHEMA : PAGE_SCHEMA;
}

export interface Issue {
    key: string;
    /** The claim being broken. */
    rule: string;
    message: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{7,40}$/;

/**
 * What a document gets wrong, as a list rather than a throw.
 *
 * A form has to show every problem at once — telling an author about one missing field,
 * then another after they fix it, is how a five-field form takes five saves.
 */
export function validateFrontmatter(fields: readonly Field[], values: Record<string, unknown>): Issue[] {
    const issues: Issue[] = [];
    const known = new Set(fields.map((f) => f.key));

    for (const field of fields) {
        const value = values[field.key];
        if (value === undefined) {
            // `verified_against: null` is a value, not an absence, so only a truly
            // missing key is reported here.
            if (field.required) {
                issues.push({ key: field.key, rule: field.rule, message: `\`${field.key}\` is missing` });
            }
            continue;
        }
        const problem = check(field, value);
        if (problem) issues.push({ key: field.key, rule: field.rule, message: problem });
    }

    // F-1 calls an unknown key an error. PAGE_SCHEMA is the exception, and says so by
    // being the schema for a kind that has no required shape.
    if (fields === SPEC_SCHEMA) {
        for (const key of Object.keys(values)) {
            if (!known.has(key)) {
                issues.push({ key, rule: "F-1", message: `\`${key}\` is not a key this format defines` });
            }
        }
    }

    return issues;
}

function check(field: Field, value: unknown): string | undefined {
    switch (field.type.kind) {
        case "text":
            if (typeof value !== "string" || value.trim() === "") return `\`${field.key}\` must not be empty`;
            return undefined;
        case "enum":
            if (typeof value !== "string" || !field.type.values.includes(value)) {
                return `\`${field.key}\` must be one of ${field.type.values.map((v) => `\`${v}\``).join(", ")}`;
            }
            return undefined;
        case "date":
            if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
                return `\`${field.key}\` must be a date written as YYYY-MM-DD`;
            }
            return undefined;
        case "paths":
            if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.trim() === "")) {
                return `\`${field.key}\` must be a list of paths, which may be empty`;
            }
            return undefined;
        case "shaOrNull":
            if (value === null) return undefined;
            if (typeof value !== "string" || !SHA.test(value)) {
                return `\`${field.key}\` must be a commit sha, or empty for never verified`;
            }
            return undefined;
    }
}
