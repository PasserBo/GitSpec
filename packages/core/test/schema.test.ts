import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../src/document.ts";
import { PAGE_SCHEMA, SPEC_SCHEMA, schemaFor, validateFrontmatter } from "../src/schema.ts";

const SPECS_DIR = join(import.meta.dir, "../../../docs/specs");

const SPECS = await Promise.all(
    (await readdir(SPECS_DIR))
        .filter((name) => name.endsWith(".md"))
        .map(async (name) => ({ name, values: parseFrontmatter(await readFile(join(SPECS_DIR, name), "utf8")) })),
);

const VALID = {
    kind: "spec",
    id: "a-spec",
    title: "A spec",
    status: "draft",
    owner: "@PasserBo",
    governs: ["packages/core/**"],
    verified_against: null,
};

describe("this repository's own specs satisfy the format they define", () => {
    test("there are specs to check", () => {
        expect(SPECS.length).toBeGreaterThan(4);
    });

    test.each(SPECS.map((s) => [s.name, s.values] as const))("%s", (_name, values) => {
        expect(validateFrontmatter(SPEC_SCHEMA, values)).toEqual([]);
    });
});

describe("F-1: every key is required, and no key outside the format is allowed", () => {
    test("a complete document has nothing to report", () => {
        expect(validateFrontmatter(SPEC_SCHEMA, VALID)).toEqual([]);
    });

    test("every missing key is reported at once, not one save at a time", () => {
        const issues = validateFrontmatter(SPEC_SCHEMA, { kind: "spec" });
        expect(issues.map((i) => i.key).sort()).toEqual([
            "governs",
            "id",
            "owner",
            "status",
            "title",
            "verified_against",
        ]);
    });

    test("an unknown key is an error, and says so", () => {
        const issues = validateFrontmatter(SPEC_SCHEMA, { ...VALID, reviewers: ["@a"] });
        expect(issues).toEqual([
            { key: "reviewers", rule: "F-1", message: "`reviewers` is not a key this format defines" },
        ]);
    });

    test("a null verified_against is a value, not an absence", () => {
        expect(validateFrontmatter(SPEC_SCHEMA, { ...VALID, verified_against: null })).toEqual([]);
    });
});

describe("each field carries the claim it comes from", () => {
    test.each([
        ["kind", "sideways", "F-6"],
        ["status", "retired", "F-3"],
        ["governs", "packages/core/**", "F-4"],
        ["verified_against", "not-a-sha", "F-5"],
    ])("a bad %s is reported against %s's rule", (key, value, rule) => {
        const issues = validateFrontmatter(SPEC_SCHEMA, { ...VALID, [key]: value });
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ key, rule });
    });

    test("governs must be a list, and an empty one is fine", () => {
        expect(validateFrontmatter(SPEC_SCHEMA, { ...VALID, governs: [] })).toEqual([]);
        expect(validateFrontmatter(SPEC_SCHEMA, { ...VALID, governs: ["a", ""] })).toHaveLength(1);
    });

    test("a real sha is accepted", () => {
        expect(validateFrontmatter(SPEC_SCHEMA, { ...VALID, verified_against: "5b5008e" })).toEqual([]);
    });

    test("F-7: a date the repository already knows is not a key the format accepts", () => {
        // Removed rather than made optional. Three of eight documents had already drifted
        // from git in four days, and an optional field drifts exactly as well.
        const issues = validateFrontmatter(SPEC_SCHEMA, { ...VALID, created: "2026-09-15" });
        expect(issues).toEqual([
            { key: "created", rule: "F-1", message: "`created` is not a key this format defines" },
        ]);
    });
});

describe("F-6: a page is subject to none of it", () => {
    test("an empty page is valid", () => {
        expect(validateFrontmatter(PAGE_SCHEMA, {})).toEqual([]);
    });

    test("a page may carry keys the format never heard of", () => {
        expect(validateFrontmatter(PAGE_SCHEMA, { sidebar_position: 3, tags: ["a"] })).toEqual([]);
    });

    test("but a key it does define still has to make sense", () => {
        expect(validateFrontmatter(PAGE_SCHEMA, { kind: "neither" })).toHaveLength(1);
    });

    test("schemaFor picks by kind", () => {
        expect(schemaFor("spec")).toBe(SPEC_SCHEMA);
        expect(schemaFor("page")).toBe(PAGE_SCHEMA);
    });
});

describe("the schema is the format, in F-1's order", () => {
    test("so a generated form reads the way the document does", () => {
        expect(SPEC_SCHEMA.map((f) => f.key)).toEqual([
            "kind",
            "id",
            "title",
            "status",
            "owner",
            "governs",
            "verified_against",
        ]);
    });
});
