import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkDocument } from "../src/check.ts";
import { agentsMarkdown } from "../src/agents.ts";
import { directoryFor, newDocument, withSummaryEntry } from "../src/scaffold.ts";
import { SPEC_SCHEMA } from "../src/schema.ts";

const ROOT = join(import.meta.dir, "../../..");

describe("G-1: a generated document passes the checker as written", () => {
    test.each([
        ["a spec", "spec" as const],
        ["a page", "page" as const],
    ])("%s", (_name, kind) => {
        const document = newDocument({ title: "Caching strategy", kind, directory: "docs/specs" });
        expect(checkDocument(document.path, document.contents, kind)).toEqual([]);
    });

    test("including one whose title needs quoting", () => {
        const document = newDocument({ title: "Rate limits: the second pass", directory: "docs/specs" });
        expect(checkDocument(document.path, document.contents, "spec")).toEqual([]);
        expect(document.contents).toContain('title: "Rate limits: the second pass"');
    });

    test("and one whose owner is an @handle", () => {
        const document = newDocument({ title: "A", owner: "@PasserBo", directory: "d" });
        expect(document.contents).toContain('owner: "@PasserBo"');
        expect(checkDocument(document.path, document.contents, "spec")).toEqual([]);
    });
});

describe("G-2: frontmatter comes from the schema, in its order", () => {
    test("every key, and nothing else", () => {
        const document = newDocument({ title: "A spec", directory: "docs/specs" });
        const block = document.contents.slice(4, document.contents.indexOf("\n---", 4));
        const keys = block.split("\n").map((line) => line.split(":")[0]);
        expect(keys).toEqual(SPEC_SCHEMA.map((f) => f.key));
    });
});

describe("G-5: a skeleton contains no claim", () => {
    test("the three sections are there and Behaviour has no bullet", () => {
        const { contents } = newDocument({ title: "A spec", directory: "d" });
        expect(contents).toContain("## Intent");
        expect(contents).toContain("## Behaviour");
        expect(contents).toContain("## Open questions");
        const behaviour = contents.slice(contents.indexOf("## Behaviour"), contents.indexOf("## Open questions"));
        expect(behaviour.split("\n").some((line) => /^-\s+\S/.test(line))).toBe(false);
    });

    test("but it suggests an identifier prefix from the title, so one less thing is arbitrary", () => {
        expect(newDocument({ title: "Caching strategy", directory: "d" }).contents).toContain("**CS-1**");
        expect(newDocument({ title: "Authoring", directory: "d" }).contents).toContain("**A-1**");
    });
});

describe("G-3: where a document goes is read from where the others are", () => {
    const specs = [
        { path: "docs/specs/a.md", kind: "spec" as const },
        { path: "docs/specs/b.md", kind: "spec" as const },
        { path: "docs/README.md", kind: "page" as const },
    ];

    test("a repository keeping specs in a subdirectory gets another one there", () => {
        expect(directoryFor("spec", "./docs", specs)).toBe("docs/specs");
    });

    test("a repository keeping them flat does not grow a subdirectory", () => {
        const flat = [
            { path: "docs/a.md", kind: "spec" as const },
            { path: "docs/b.md", kind: "spec" as const },
        ];
        expect(directoryFor("spec", "./docs", flat)).toBe("docs");
    });

    test("a page goes where the pages are", () => {
        expect(directoryFor("page", "./docs", specs)).toBe("docs");
    });

    test("with nothing to learn from, the obvious convention is chosen", () => {
        expect(directoryFor("spec", "./docs", [])).toBe("docs/specs");
        expect(directoryFor("page", "./docs", [])).toBe("docs");
    });

    test("and a document outside the space teaches it nothing", () => {
        const elsewhere = [{ path: "other/place/a.md", kind: "spec" as const }];
        expect(directoryFor("spec", "./docs", elsewhere)).toBe("docs/specs");
    });
});

describe("N-6: the navigation entry goes beside its neighbours", () => {
    const SUMMARY = `# Summary

* [Overview](README.md)

## Specs

* [Alpha](specs/alpha.md)
* [Beta](specs/beta.md)
`;

    test("a new spec joins the specs rather than landing at the end", () => {
        const next = withSummaryEntry("docs/SUMMARY.md", SUMMARY, {
            path: "docs/specs/gamma.md",
            title: "Gamma",
        })!;
        expect(next).toContain("* [Beta](specs/beta.md)\n* [Gamma](specs/gamma.md)\n");
    });

    test("a document in a directory nothing lists yet goes after the last entry", () => {
        const next = withSummaryEntry("docs/SUMMARY.md", SUMMARY, {
            path: "docs/guides/first.md",
            title: "First",
        })!;
        expect(next.trimEnd().endsWith("* [First](guides/first.md)")).toBe(true);
    });

    test("entries are relative to the navigation file, not to the repository root", () => {
        const next = withSummaryEntry("docs/SUMMARY.md", SUMMARY, { path: "docs/specs/g.md", title: "G" })!;
        expect(next).toContain("](specs/g.md)");
        expect(next).not.toContain("](docs/specs/g.md)");
    });

    test("a document already listed is not listed twice", () => {
        expect(withSummaryEntry("docs/SUMMARY.md", SUMMARY, { path: "docs/specs/alpha.md", title: "Alpha" })).toBeUndefined();
    });

    test("N-4: nothing else in the file moves", () => {
        const next = withSummaryEntry("docs/SUMMARY.md", SUMMARY, { path: "docs/specs/g.md", title: "G" })!;
        const removed = next.split("\n").filter((line) => !SUMMARY.split("\n").includes(line));
        expect(removed).toEqual(["* [G](specs/g.md)"]);
    });

    test("a navigation file with no entries at all still gets one", () => {
        const next = withSummaryEntry("docs/SUMMARY.md", "# Summary\n", { path: "docs/a.md", title: "A" })!;
        expect(next).toBe("# Summary\n\n* [A](a.md)\n");
    });
});

describe("G-6: what agents are told comes from the schema", () => {
    const contract = agentsMarkdown({
        spaces: [{ key: "docs", title: "Docs", directory: "./docs", summary: "docs/SUMMARY.md" }],
        checkCommand: "bun run check",
        newCommand: "bun run new",
    });

    test("every frontmatter key the schema defines is described", () => {
        for (const field of SPEC_SCHEMA) {
            expect(contract, field.key).toContain(`\`${field.key}\``);
        }
    });

    test("and the legal values, rather than a prose paraphrase of them", () => {
        expect(contract).toContain("`draft`, `active`, `superseded`");
    });

    test("the tables it writes are tables, not cells split by a stray pipe", () => {
        for (const line of contract.split("\n")) {
            if (!line.startsWith("| `")) continue;
            // A `|` inside a value would silently add a column, which is how a generated
            // table turns into nonsense nobody reads.
            expect(line.split("|").length, line).toBeLessThanOrEqual(7);
        }
    });

    test("it names the commands, because a rule nobody can run is a rule nobody keeps", () => {
        expect(contract).toContain("bun run check");
        expect(contract).toContain("bun run new");
    });

    test("it warns about the two things the format does not forgive", () => {
        expect(contract).toContain("never reused or renumbered");
        expect(contract).toContain("do **not** add `created` or `updated`".replace("do", "Do"));
    });
});

describe("this repository's own AGENTS.md is the generated one", () => {
    test("byte for byte, so it cannot drift from the schema", async () => {
        const onDisk = await readFile(join(ROOT, "AGENTS.md"), "utf8");
        const generated = agentsMarkdown({
            spaces: [{ key: "gitspec-docs", title: "GitSpec", directory: "./docs", summary: "docs/SUMMARY.md" }],
            checkCommand: "bun run check",
            newCommand: "bun run new",
        });
        expect(onDisk).toBe(generated);
    });
});
