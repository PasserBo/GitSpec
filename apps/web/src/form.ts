import {
    locateFrontmatter,
    readBody,
    replaceBody,
    schemaFor,
    spliceFrontmatter,
    type DocumentKind,
    type Field,
    type FrontmatterValue,
} from "@gitspec/core/browser";
import { escape } from "./ui.ts";

/**
 * The frontmatter form, as logic with no DOM in it.
 *
 * Everything here is a pure function over text, which is what lets the behaviour the
 * authoring spec claims be tested without a browser. The editor module below it is left
 * with element wiring and nothing else.
 */

export interface FormField {
    field: Field;
    /** The value as an input shows it. A path list is one path per line. */
    text: string;
}

export type FormPlan =
    | { kind: "fields"; fields: FormField[] }
    /** W-7: no form, and a reason the author can act on. */
    | { kind: "none"; reason: string };

export function planForm(source: string, kind: DocumentKind): FormPlan {
    const located = locateFrontmatter(source);
    if (located.kind === "opaque") {
        return { kind: "none", reason: `this document's frontmatter ${located.reason}` };
    }
    // A page has no shape to generate a form from, and F-6 says it need not have one.
    // Offering three mostly-empty inputs above the text would be worse than nothing.
    if (kind === "page" && located.kind === "absent") {
        return { kind: "none", reason: "this is a page, and pages carry no required fields" };
    }
    const values = located.kind === "block" ? located.values : {};
    return {
        kind: "fields",
        fields: schemaFor(kind).map((field) => ({ field, text: textFrom(field, values[field.key]) })),
    };
}

/** What an input should show for a value already in the document. */
export function textFrom(field: Field, value: unknown): string {
    if (value === undefined || value === null) return "";
    if (field.type.kind === "paths") return Array.isArray(value) ? value.join("\n") : String(value);
    return String(value);
}

/**
 * Every field's value, typed as the frontmatter wants it.
 *
 * Deliberately returns all of them rather than only what looks edited. W-3 makes that
 * safe — a value equal to what the document already says is dropped before anything is
 * written — and it means validation and the commit read one map instead of two.
 */
export function valuesFrom(
    fields: readonly Field[],
    text: Record<string, string>,
): Record<string, FrontmatterValue> {
    const values: Record<string, FrontmatterValue> = {};
    for (const field of fields) {
        values[field.key] = valueFrom(field, text[field.key] ?? "");
    }
    return values;
}

function valueFrom(field: Field, raw: string): FrontmatterValue {
    switch (field.type.kind) {
        case "paths":
            return raw
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
        case "shaOrNull":
            // F-5: never verified is `null`, and an empty box is how someone says that.
            return raw.trim() === "" ? null : raw.trim();
        default:
            return raw.trim();
    }
}

/** The file to commit: frontmatter spliced, body swapped, everything else untouched. */
export function assemble(
    source: string,
    values: Record<string, FrontmatterValue | undefined>,
    body: string,
): string {
    // A document that had no frontmatter is getting its first block, and the block has to
    // be built onto the body the author is holding. Building it onto `source` and then
    // swapping the body in loses the blank line between the two.
    if (locateFrontmatter(source).kind === "absent") return spliceFrontmatter(body, values);
    return replaceBody(spliceFrontmatter(source, values), body);
}

export { readBody };

/** One field's markup. Pure, so the form can be checked without a browser. */
export function fieldControl(entry: FormField): string {
    const { field, text } = entry;
    const id = `f-${field.key}`;
    const help = field.help ? `<span class="help">${escape(field.help)}</span>` : "";
    const head = `<label for="${id}">${escape(field.label)} <span class="rule">${escape(field.rule)}</span></label>${help}`;

    if (field.type.kind === "enum") {
        // A value outside the list is kept as an option rather than dropped. Without it
        // the browser would select the first entry and silently rewrite a field the
        // author never touched, which is the one thing W-1 forbids.
        const values = field.type.values.includes(text) || text === "" ? field.type.values : [text, ...field.type.values];
        const options = values
            .map((v) => `<option value="${escape(v)}"${v === text ? " selected" : ""}>${escape(v)}</option>`)
            .join("");
        return `<div class="field" data-key="${escape(field.key)}">${head}<select id="${id}">${options}</select><p class="issue"></p></div>`;
    }
    if (field.type.kind === "paths") {
        return `<div class="field wide" data-key="${escape(field.key)}">${head}<textarea id="${id}" rows="3" spellcheck="false" placeholder="One path glob per line">${escape(text)}</textarea><p class="issue"></p></div>`;
    }
    const placeholder = field.type.kind === "date" ? "YYYY-MM-DD" : field.type.kind === "shaOrNull" ? "empty if never verified" : "";
    return `<div class="field" data-key="${escape(field.key)}"><div>${head}</div><input id="${id}" value="${escape(text)}" placeholder="${escape(placeholder)}" spellcheck="false"><p class="issue"></p></div>`;
}
