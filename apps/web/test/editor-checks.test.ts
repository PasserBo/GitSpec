import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
    checkDocument,
    directoryFor,
    newDocument,
    readBody,
    SPEC_SCHEMA,
    sortFindings,
    withSummaryEntry,
} from "@gitspec/core/browser";
import { assemble, planForm, valuesFrom } from "../src/form.ts";

const ROOT = join(import.meta.dir, "../../..");
const SPEC = await readFile(join(ROOT, "docs/specs/authoring.md"), "utf8");

/** What the editor computes on every pause: the document as it would be committed. */
function asCommitted(source: string, fields: Record<string, string>, body: string): string {
    return assemble(source, valuesFrom(SPEC_SCHEMA, fields), body);
}

function opened(source: string): Record<string, string> {
    const plan = planForm(source, "spec");
    if (plan.kind !== "fields") throw new Error("expected fields");
    return Object.fromEntries(plan.fields.map((f) => [f.field.key, f.text]));
}

describe("V-9: the editor judges a document by the same rules as the command", () => {
    test("an untouched document has nothing said about it", () => {
        const fields = opened(SPEC);
        expect(checkDocument("docs/specs/authoring.md", asCommitted(SPEC, fields, readBody(SPEC)), "spec")).toEqual([]);
    });

    test("a bullet typed into Behaviour without an identifier is reported, with its line", () => {
        const body = readBody(SPEC).replace(
            "### Fidelity",
            "### Fidelity\n\n- A rule nobody can refer to later.",
        );
        const findings = sortFindings(checkDocument("a.md", asCommitted(SPEC, opened(SPEC), body), "spec"));
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ rule: "C-1" });
        expect(findings[0]!.line).toBeGreaterThan(1);
    });

    test("a reused identifier is reported against C-2", () => {
        const body = readBody(SPEC).replace("- **W-2**", "- **W-1**");
        const findings = checkDocument("a.md", asCommitted(SPEC, opened(SPEC), body), "spec");
        expect(findings.map((f) => f.rule)).toContain("C-2");
    });

    test("a section removed from the body is reported against S-1", () => {
        const body = readBody(SPEC).replace("## Open questions", "## Notes");
        const findings = checkDocument("a.md", asCommitted(SPEC, opened(SPEC), body), "spec");
        expect(findings.map((f) => f.rule)).toContain("S-1");
    });

    test("a field problem carries the key, so the form can put it where it belongs", () => {
        const findings = checkDocument(
            "a.md",
            asCommitted(SPEC, { ...opened(SPEC), status: "retired" }, readBody(SPEC)),
            "spec",
        );
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ rule: "F-3", key: "status" });
    });

    test("a body problem carries no key, so it goes to the list instead", () => {
        const body = readBody(SPEC).replace("### Fidelity", "### Fidelity\n\n- Unidentified.");
        const findings = checkDocument("a.md", asCommitted(SPEC, opened(SPEC), body), "spec");
        expect(findings.every((f) => f.key === undefined)).toBe(true);
    });
});

describe("starting a document from the site writes what the command would", () => {
    const documents = [
        { path: "docs/specs/a.md", kind: "spec" as const },
        { path: "docs/README.md", kind: "page" as const },
    ];

    test("the same skeleton, in the same place", () => {
        const directory = directoryFor("spec", "docs", documents);
        const document = newDocument({ title: "Caching strategy", kind: "spec", directory });
        expect(document.path).toBe("docs/specs/caching-strategy.md");
        // G-1: what the screen is about to propose passes the checker as written.
        expect(checkDocument(document.path, document.contents, "spec")).toEqual([]);
    });

    test("and the navigation entry that goes with it, in the same change", () => {
        const summary = "# Summary\n\n* [Overview](README.md)\n\n## Specs\n\n* [A](specs/a.md)\n";
        const document = newDocument({ title: "Caching strategy", directory: "docs/specs" });
        const next = withSummaryEntry("docs/SUMMARY.md", summary, document)!;
        expect(next).toContain("* [A](specs/a.md)\n* [Caching strategy](specs/caching-strategy.md)\n");
    });

    test("a page goes where the pages are, and is checked against nothing", () => {
        const directory = directoryFor("page", "docs", documents);
        const document = newDocument({ title: "Release notes", kind: "page", directory });
        expect(document.path).toBe("docs/release-notes.md");
        expect(checkDocument(document.path, document.contents, "page")).toEqual([]);
    });
});
