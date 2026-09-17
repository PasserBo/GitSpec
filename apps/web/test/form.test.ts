import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SPEC_SCHEMA, validateFrontmatter } from "@gitspec/core";
import { assemble, planForm, readBody, textFrom, valuesFrom } from "../src/form.ts";

const ROOT = join(import.meta.dir, "../../..");
const SPEC = await readFile(join(ROOT, "docs/specs/authoring.md"), "utf8");

/** What the editor holds while a document is open: one string per field. */
function opened(source: string, kind: "spec" | "page" = "spec"): Record<string, string> {
    const plan = planForm(source, kind);
    if (plan.kind !== "fields") throw new Error(`expected fields, got ${plan.reason}`);
    return Object.fromEntries(plan.fields.map((f) => [f.field.key, f.text]));
}

describe("W-2: opening a document and saving it writes nothing", () => {
    test("the whole form, handed straight back, is byte-identical", () => {
        const text = opened(SPEC);
        const next = assemble(SPEC, valuesFrom(SPEC_SCHEMA, text), readBody(SPEC));
        expect(next).toBe(SPEC);
    });

    test("so the editor can tell there is nothing to propose", () => {
        const text = opened(SPEC);
        expect(assemble(SPEC, valuesFrom(SPEC_SCHEMA, text), readBody(SPEC)) === SPEC).toBe(true);
    });
});

describe("W-1: an edit reaches one field", () => {
    test("changing status changes one line and nothing else", () => {
        const text = { ...opened(SPEC), status: "active" };
        const next = assemble(SPEC, valuesFrom(SPEC_SCHEMA, text), readBody(SPEC));
        const differing = SPEC.split("\n")
            .map((line, i) => [line, next.split("\n")[i]!] as const)
            .filter(([a, b]) => a !== b);
        expect(differing).toEqual([["status: draft", "status: active"]]);
    });

    test("editing the body leaves the frontmatter alone", () => {
        const text = opened(SPEC);
        const next = assemble(SPEC, valuesFrom(SPEC_SCHEMA, text), readBody(SPEC) + "\nA new paragraph.\n");
        expect(next.slice(0, next.indexOf("\n# "))).toBe(SPEC.slice(0, SPEC.indexOf("\n# ")));
        expect(next.endsWith("\nA new paragraph.\n")).toBe(true);
    });
});

describe("values survive the trip through an input and back", () => {
    test("a path list is edited as lines and stored as a list", () => {
        const fields = planForm(SPEC, "spec");
        if (fields.kind !== "fields") throw new Error("expected fields");
        const governs = fields.fields.find((f) => f.field.key === "governs")!;
        // A block list arrives as one path per line, which is how it is edited.
        expect(governs.text.split("\n")).toEqual([
            "packages/core/src/frontmatter.ts",
            "packages/core/src/schema.ts",
            "apps/web/src/form.ts",
            "apps/web/src/editor.ts",
        ]);
        expect(valuesFrom(SPEC_SCHEMA, { ...opened(SPEC), governs: "a/**\n\n  b/**  \n" }).governs).toEqual([
            "a/**",
            "b/**",
        ]);
    });

    test("an empty verified_against is null, not the empty string", () => {
        expect(valuesFrom(SPEC_SCHEMA, { ...opened(SPEC), verified_against: "  " }).verified_against).toBeNull();
        expect(textFrom(SPEC_SCHEMA.find((f) => f.key === "verified_against")!, null)).toBe("");
    });

    test("so a document that was valid stays valid after a round trip", () => {
        const values = valuesFrom(SPEC_SCHEMA, opened(SPEC));
        expect(validateFrontmatter(SPEC_SCHEMA, values)).toEqual([]);
    });

    test("and the form reports what is wrong before anything is written", () => {
        const values = valuesFrom(SPEC_SCHEMA, { ...opened(SPEC), status: "retired", created: "" });
        expect(validateFrontmatter(SPEC_SCHEMA, values).map((i) => i.rule).sort()).toEqual(["F-1", "F-3"]);
    });
});

describe("W-7: a document with no usable frontmatter gets no form", () => {
    test("and the reason names what is wrong", () => {
        const plan = planForm("---\n{ a: 1 }\n---\n\n# B\n", "spec");
        expect(plan).toMatchObject({ kind: "none", reason: expect.stringContaining("key by key") });
    });

    test("a duplicated key is refused with its own reason", () => {
        const plan = planForm("---\nid: a\nid: b\n---\n\n# B\n", "spec");
        expect(plan).toMatchObject({ kind: "none", reason: expect.stringContaining("more than once") });
    });

    test("a page with no frontmatter is not an error, just no form", () => {
        expect(planForm("# Just a page\n", "page")).toMatchObject({ kind: "none" });
    });
});

describe("a spec that has no frontmatter yet", () => {
    const BARE = "# A new spec\n\n## Intent\n";

    test("gets the whole format as empty fields", () => {
        const plan = planForm(BARE, "spec");
        if (plan.kind !== "fields") throw new Error("expected fields");
        expect(plan.fields.map((f) => f.field.key)).toEqual(SPEC_SCHEMA.map((f) => f.key));
        expect(plan.fields.every((f) => f.text === "")).toBe(true);
    });

    test("and filling them in creates a block in F-1 order, above the body it had", () => {
        const values = valuesFrom(SPEC_SCHEMA, {
            kind: "spec",
            id: "new",
            title: "A new spec",
            status: "draft",
            owner: "@PasserBo",
            created: "2026-09-18",
            updated: "2026-09-18",
            governs: "",
            verified_against: "",
        });
        const next = assemble(BARE, values, BARE);
        expect(next).toBe(
            "---\nkind: spec\nid: new\ntitle: A new spec\nstatus: draft\nowner: \"@PasserBo\"\n" +
                "created: 2026-09-18\nupdated: 2026-09-18\ngoverns: []\nverified_against: null\n---\n\n" +
                "# A new spec\n\n## Intent\n",
        );
        expect(validateFrontmatter(SPEC_SCHEMA, values)).toEqual([]);
    });
});
