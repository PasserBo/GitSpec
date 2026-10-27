import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { claimsIn, documentFrom, readBody } from "@gitspec/core";
import { renderMarkdown } from "../src/markdown.ts";
import { slugFor } from "../src/anchors.ts";

const ROOT = join(import.meta.dir, "../../..");

async function render(path: string): Promise<string> {
    const source = await readFile(join(ROOT, path), "utf8");
    const document = documentFrom({ path, spaceKey: "docs", spacePath: "/", source, isHome: false });
    return renderMarkdown(document, readBody(source), () => undefined, "");
}

const SPEC = "docs/specs/spec-format.md";
const html = await render(SPEC);
const source = await readFile(join(ROOT, SPEC), "utf8");

describe("C-2 made usable: a claim has an address", () => {
    test("every claim in the document is an anchor in the page", async () => {
        const claims = claimsIn(source);
        expect(claims.length).toBeGreaterThan(10);
        for (const claim of claims) {
            expect(html, claim.id).toContain(`<li id="${claim.id}" class="claim">`);
        }
    });

    test("the identifier itself is the link, because it is what a reader would quote", () => {
        expect(html).toContain('<strong><a href="#F-1" class="claim-anchor">F-1</a></strong>');
    });

    test("and the statement after it is untouched", () => {
        expect(html).toContain("— Every spec begins with YAML frontmatter containing");
    });
});

describe("every heading has an address too", () => {
    test.each([
        ["Spec document format", "spec-document-format"],
        ["Intent", "intent"],
        ["Behaviour", "behaviour"],
        ["Frontmatter", "frontmatter"],
    ])("%s becomes #%s", (_text, id) => {
        expect(html).toContain(`id="${id}"`);
    });

    test("the link on a heading is there but out of the way until hovered", () => {
        expect(html).toContain('class="anchor"');
        expect(html).toContain('href="#intent"');
    });

    test("a repeated heading does not steal the first one's address", async () => {
        const twice = "## Notes\n\nOne.\n\n## Notes\n\nTwo.\n";
        const document = documentFrom({ path: "a.md", spaceKey: "d", spacePath: "/", source: twice, isHome: false });
        const out = await renderMarkdown(document, twice, () => undefined, "");
        expect(out).toContain('id="notes"');
        expect(out).toContain('id="notes-2"');
    });
});

describe("what is not a claim does not become one", () => {
    const page = async (markdown: string) => {
        const document = documentFrom({ path: "a.md", spaceKey: "d", spacePath: "/", source: markdown, isHome: false });
        return renderMarkdown(document, markdown, () => undefined, "");
    };

    test("a bullet whose bold text is not an identifier is left alone", async () => {
        expect(await page("- **Important** — but not a claim\n")).not.toContain('class="claim"');
    });

    test("a bullet with no bold at all is left alone", async () => {
        expect(await page("- just a bullet\n")).not.toContain('class="claim"');
    });

    test("a loose list item, where the identifier sits inside a paragraph, still works", async () => {
        const loose = "- **X-1** — first\n\n- **X-2** — second\n";
        const out = await page(loose);
        expect(out).toContain('id="X-1"');
        expect(out).toContain('id="X-2"');
    });

    test("two claims with one identifier do not produce two elements with one id", async () => {
        const out = await page("- **X-1** — first\n- **X-1** — second\n");
        expect([...out.matchAll(/id="X-1"/g)]).toHaveLength(1);
    });
});

describe("slugFor", () => {
    test.each([
        ["Open questions", "open-questions"],
        ["  Spaced  out  ", "spaced-out"],
        ["Punctuation: removed!", "punctuation-removed"],
        ["仕様の形式", "仕様の形式"],
    ])("%s → %s", (text, slug) => {
        expect(slugFor(text)).toBe(slug);
    });
});
