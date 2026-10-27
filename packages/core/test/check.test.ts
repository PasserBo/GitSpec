import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { checkDocument, checkRepository, sortFindings } from "../src/check.ts";
import { documentFrom } from "../src/document.ts";

const ROOT = join(import.meta.dir, "../../..");

const HEAD = `---
kind: spec
id: example
title: Example
status: draft
owner: "@PasserBo"
governs: []
verified_against: null
---
`;

const BODY = `
# Example

## Intent

Why.

## Behaviour

- **X-1** — Something true or false of the code.

## Open questions

**None.**
`;

const good = HEAD + BODY;
const check = (source: string, kind: "spec" | "page" = "spec") => checkDocument("docs/a.md", source, kind);

describe("a document that keeps the rules has nothing said about it", () => {
    test("the example is clean", () => {
        expect(check(good)).toEqual([]);
    });

    test("and so is every spec in this repository", async () => {
        const dir = join(ROOT, "docs/specs");
        const findings = [];
        for (const name of await readdir(dir)) {
            if (!name.endsWith(".md")) continue;
            findings.push(...check(await readFile(join(dir, name), "utf8")).map((f) => `${name} ${f.rule}`));
        }
        expect(findings).toEqual([]);
    });
});

describe("F-1: the frontmatter has to be there and be complete", () => {
    test("a missing key is named, at the line the block starts", () => {
        const [finding] = check(good.replace('owner: "@PasserBo"\n', ""));
        expect(finding).toMatchObject({ rule: "F-1", line: 1 });
        expect(finding!.message).toContain("owner");
    });

    test("a bad status is reported against F-3, at its own line", () => {
        const [finding] = check(good.replace("status: draft", "status: retired"));
        expect(finding).toMatchObject({ rule: "F-3", line: 5 });
    });

    test("a spec with no frontmatter at all is told so once, not nine times", () => {
        const findings = check(BODY);
        expect(findings.filter((f) => f.rule === "F-1").length).toBeGreaterThan(0);
        expect(findings[0]!.message).toContain("begins with YAML frontmatter");
    });

    test("frontmatter that cannot be parsed stops there rather than guessing", () => {
        const findings = check("---\n{ a: 1 }\n---\n\n# A\n");
        expect(findings).toHaveLength(1);
        expect(findings[0]!.rule).toBe("F-1");
    });
});

describe("S-1: exactly three sections, in order", () => {
    const sections = (body: string) => check(HEAD + body).filter((f) => f.rule === "S-1");

    test("a fourth section is an error — the one that actually happened here", () => {
        const findings = sections(BODY + "\n## Test Spec Update Feature\n\nLeftover.\n");
        expect(findings).toHaveLength(1);
        expect(findings[0]!.message).toContain("unexpected `Test Spec Update Feature`");
    });

    test("a missing section says which", () => {
        expect(sections(BODY.replace("## Open questions\n\n**None.**\n", ""))[0]!.message).toContain(
            "missing `Open questions`",
        );
    });

    test("the right sections in the wrong order are still wrong", () => {
        const swapped = `
# Example

## Behaviour

- **X-1** — A claim.

## Intent

Why.

## Open questions

**None.**
`;
        expect(sections(swapped)[0]!.message).toContain("out of order");
    });

    test("a heading inside a fence is an example, not a section", () => {
        const withFence = BODY.replace(
            "Why.",
            "Why.\n\n```markdown\n## Behaviour\n\n## Not a section\n```",
        );
        expect(sections(withFence)).toEqual([]);
    });

    test("subsections carry no meaning, per S-3", () => {
        expect(sections(BODY.replace("- **X-1**", "### Grouping\n\n- **X-1**"))).toEqual([]);
    });
});

describe("C-1 and C-2: every statement in Behaviour is an identified claim", () => {
    const claims = (behaviour: string) =>
        check(HEAD + BODY.replace("- **X-1** — Something true or false of the code.", behaviour));

    test("a bullet with no identifier is an error at its own line", () => {
        const [finding] = claims("- Something nobody can refer to later.");
        expect(finding).toMatchObject({ rule: "C-1" });
        expect(finding!.message).toContain("**PREFIX-1**");
    });

    test("a reused identifier names the line it was used on", () => {
        const [finding] = claims("- **X-1** — First.\n- **X-1** — Second.");
        expect(finding).toMatchObject({ rule: "C-2" });
        expect(finding!.message).toContain("already used on line");
    });

    test("a nested bullet belongs to the claim above it", () => {
        expect(claims("- **X-1** — A claim.\n  - a detail of it\n  - another")).toEqual([]);
    });

    test("prose in Behaviour is not a bullet and is left alone", () => {
        expect(claims("Some framing.\n\n- **X-1** — A claim.")).toEqual([]);
    });

    test("a bullet inside a fenced example is not a claim", () => {
        expect(claims("- **X-1** — A claim.\n\n```md\n- a plain bullet\n```")).toEqual([]);
    });

    test("bullets outside Behaviour are not claims", () => {
        const source = HEAD + BODY.replace("**None.**", "- just a list\n- of things");
        expect(check(source)).toEqual([]);
    });
});

describe("F-6: a page is subject to none of it", () => {
    test("no frontmatter, no sections, no claims, no complaints", () => {
        expect(check("# Just a page\n\n- a bullet\n", "page")).toEqual([]);
    });
});

describe("what only shows up across documents", () => {
    const doc = (path: string, source: string) => ({
        document: documentFrom({ path, spaceKey: "docs", spacePath: "/", source, isHome: false }),
        source,
    });

    test("A-2: two documents declaring one id each name the other", () => {
        const findings = checkRepository({
            documents: [doc("docs/a.md", good), doc("docs/b.md", good)],
            files: new Set(["docs/a.md", "docs/b.md"]),
        }).filter((f) => f.rule === "A-2");
        expect(findings).toHaveLength(2);
        expect(findings[0]!.message).toContain("docs/b.md");
        expect(findings[1]!.message).toContain("docs/a.md");
    });

    test("an id taken from the path cannot collide, so it is not checked", () => {
        const page = "# A page\n";
        const findings = checkRepository({
            documents: [doc("docs/x.md", page), doc("docs/y.md", page)],
            files: new Set(["docs/x.md", "docs/y.md"]),
        });
        expect(findings.filter((f) => f.rule === "A-2")).toEqual([]);
    });

    test("a link to nothing is a warning, resolved relative to the document", () => {
        const source = HEAD + BODY.replace("Why.", "See [the other one](./other.md).");
        const findings = checkRepository({
            documents: [doc("docs/specs/a.md", source)],
            files: new Set(["docs/specs/a.md"]),
        });
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ rule: "R-5", severity: "warning" });
        expect(findings[0]!.message).toContain("docs/specs/other.md");
    });

    test("a link that resolves to a file which is not a document is fine", () => {
        const source = HEAD + BODY.replace("Why.", "See [the code](../../packages/core/src/check.ts).");
        const findings = checkRepository({
            documents: [doc("docs/specs/a.md", source)],
            files: new Set(["docs/specs/a.md", "packages/core/src/check.ts"]),
        });
        expect(findings).toEqual([]);
    });

    test("a link written inside code is an example, not a link", () => {
        const source = HEAD + BODY.replace("Why.", "Write it as `[a](./nope.md)` or\n\n```md\n[b](./also-nope.md)\n```");
        const findings = checkRepository({
            documents: [doc("docs/specs/a.md", source)],
            files: new Set(["docs/specs/a.md"]),
        });
        expect(findings).toEqual([]);
    });

    test("external and site-absolute links are somebody else's to keep", () => {
        const source = HEAD + BODY.replace("Why.", "[a](https://example.test) [b](/elsewhere) [c](#anchor)");
        const findings = checkRepository({
            documents: [doc("docs/specs/a.md", source)],
            files: new Set(["docs/specs/a.md"]),
        });
        expect(findings).toEqual([]);
    });
});

describe("the order findings come in", () => {
    test("errors before warnings, then by file and line", () => {
        const findings = sortFindings([
            { path: "b.md", rule: "X", message: "", line: 1, severity: "warning" },
            { path: "b.md", rule: "X", message: "", line: 9, severity: "error" },
            { path: "a.md", rule: "X", message: "", line: 4, severity: "error" },
        ]);
        expect(findings.map((f) => `${f.severity} ${f.path}:${f.line}`)).toEqual([
            "error a.md:4",
            "error b.md:9",
            "warning b.md:1",
        ]);
    });
});
