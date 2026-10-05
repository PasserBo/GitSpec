import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readBody } from "@gitspec/core/browser";
import { parseDocument } from "../src/rich/parse.ts";
import { serializeDocument, serializeBlock } from "../src/rich/serialize.ts";
import { schema } from "../src/rich/schema.ts";

const ROOT = join(import.meta.dir, "../../..");

async function corpus(): Promise<{ path: string; body: string }[]> {
    const found: { path: string; body: string }[] = [];
    async function walk(dir: string, rel: string) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const next = join(dir, entry.name);
            const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) await walk(next, nextRel);
            else if (entry.name.endsWith(".md")) {
                found.push({ path: nextRel, body: readBody(await readFile(next, "utf8")) });
            }
        }
    }
    await walk(join(ROOT, "docs"), "docs");
    await walk(join(ROOT, "fixtures"), "fixtures");
    return found;
}

const FILES = await corpus();

describe("W-10: a document opened in the rich editor and saved is unchanged", () => {
    test("there is a corpus to check", () => {
        expect(FILES.length).toBeGreaterThan(20);
    });

    test.each(FILES.map((f) => [f.path, f.body] as const))("%s, byte for byte", (_path, body) => {
        const parsed = parseDocument(body);
        expect(serializeDocument(parsed.doc, parsed)).toBe(body);
    });

    test("every block of every document is quoted, not re-serialised", () => {
        // If a block had no recorded span the document would still round trip by luck,
        // through a serializer that happened to agree. This is what makes the test above
        // mean what it says.
        for (const { path, body } of FILES) {
            const parsed = parseDocument(body);
            const quoted = parsed.doc.children.filter((node) => parsed.spans.has(node)).length;
            expect(quoted, path).toBe(parsed.doc.childCount);
        }
    });
});

const SPEC = readBody(await readFile(join(ROOT, "docs/specs/spec-format.md"), "utf8"));

describe("W-10: an edit reaches the block it was made in", () => {
    test("rewriting one paragraph leaves every other byte alone", () => {
        const parsed = parseDocument(SPEC);
        const index = parsed.doc.children.findIndex(
            (n) => n.type.name === "paragraph" && n.textContent.startsWith("A spec is worth"),
        );
        expect(index).toBeGreaterThan(-1);

        const replacement = schema.nodes.paragraph!.create(null, schema.text("Replaced."));
        const next = parsed.doc.replace(
            parsed.doc.resolve(0).posAtIndex(index),
            parsed.doc.resolve(0).posAtIndex(index + 1),
            schema.nodes.doc!.create(null, [replacement]).slice(0),
        );

        const out = serializeDocument(next, parsed);
        expect(out).toContain("Replaced.");
        expect(out).not.toContain("A spec is worth writing only if");
        // Everything after the edited paragraph is untouched, including the hard wrapping
        // that a serializer would have reflowed.
        expect(out).toContain(
            "The central move is to stop treating a spec as prose. Asking a model to extract\ncheckable statements",
        );
        // And the claim identifiers, whose exact bold-at-line-start shape C-1 depends on.
        expect(out).toContain("- **F-1** — Every spec begins with YAML frontmatter containing");
    });

    test("the untouched blocks keep their object identity, which is what the span map needs", () => {
        const parsed = parseDocument(SPEC);
        const first = parsed.doc.child(0);
        const replacement = schema.nodes.paragraph!.create(null, schema.text("x"));
        const next = parsed.doc.replace(
            parsed.doc.resolve(0).posAtIndex(2),
            parsed.doc.resolve(0).posAtIndex(3),
            schema.nodes.doc!.create(null, [replacement]).slice(0),
        );
        expect(next.child(0)).toBe(first);
        expect(parsed.spans.has(next.child(0))).toBe(true);
    });
});

describe("W-11: what the schema cannot model is never re-serialised", () => {
    test("raw HTML survives exactly", () => {
        const body = "# A\n\n<details>\n<summary>Why</summary>\n\nBecause.\n\n</details>\n\nAfter.\n";
        const parsed = parseDocument(body);
        expect(parsed.doc.children.some((n) => n.type.name === "verbatim")).toBe(true);
        expect(serializeDocument(parsed.doc, parsed)).toBe(body);
    });

    test("a fence in a language nothing here understands is still a code block, not a guess", () => {
        const body = "```mermaid\ngraph TD;\n  A-->B;\n```\n";
        const parsed = parseDocument(body);
        expect(parsed.doc.child(0).type.name).toBe("code_block");
        expect(parsed.doc.child(0).attrs.language).toBe("mermaid");
        expect(serializeDocument(parsed.doc, parsed)).toBe(body);
    });

    test("an edited verbatim block writes back its own text and nothing else", () => {
        const node = schema.nodes.verbatim!.create({ text: "<x>\n  raw\n</x>", label: "HTML" });
        expect(serializeBlock(node)).toBe("<x>\n  raw\n</x>");
    });
});

describe("what a changed block looks like when it has to be written", () => {
    const write = (markdown: string) => {
        const parsed = parseDocument(markdown);
        return serializeBlock(parsed.doc.child(0));
    };

    test.each([
        ["a heading", "## Behaviour"],
        ["bold and emphasis", "Some *italic* and **bold** text."],
        ["inline code", "A `value` inline."],
        ["a link", "See [the spec](./spec-format.md) for more."],
        ["a claim bullet", "- **F-1** — Every spec begins with frontmatter."],
        ["a nested bullet", "- one\n  - two"],
        ["an ordered list", "1. one\n1. two"],
        ["a blockquote", "> Quoted."],
        ["a fenced block", "```ts\nconst a = 1;\n```"],
        ["a rule", "---"],
        ["an image", "![alt](./images/a.png)"],
        ["strikethrough", "This is ~~gone~~ now."],
    ])("%s is written the way this repository writes it", (_name, markdown) => {
        expect(write(markdown)).toBe(markdown);
    });

    test("a table keeps its columns, if not its padding", () => {
        const out = write("| a | b |\n| --- | --- |\n| 1 | 2 |");
        expect(out.split("\n")).toHaveLength(3);
        expect(out).toContain("| a");
        expect(out).toContain("| 1");
    });

    test("a run of text under one bold span stays one span", () => {
        expect(write("**one two three** after")).toBe("**one two three** after");
    });
});
