import { describe, expect, test } from "bun:test";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { parseDocument } from "../src/rich/parse.ts";
import { serializeDocument, serializeBlock } from "../src/rich/serialize.ts";
import { ENTRIES, matching } from "../src/rich/chrome.ts";
import { insertTable, toggleHeading, toggleList, toggleQuote, toggleCodeBlock } from "../src/rich/input.ts";
import { schema } from "../src/rich/schema.ts";

/**
 * The commands behind the slash menu, the block menu and the keyboard, exercised without
 * a browser. ProseMirror's state is a plain data structure, so everything except the
 * pixels can be checked here — and what these produce has to be Markdown this repository
 * would have written by hand.
 */

function run(markdown: string, command: Command, at = 1): string {
    const parsed = parseDocument(markdown);
    let state = EditorState.create({ doc: parsed.doc, schema });
    state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(at))));
    command(state, (tr) => {
        state = state.apply(tr);
    });
    return serializeDocument(state.doc, parsed);
}

describe("every slash entry produces Markdown, not an unsaveable document", () => {
    test.each(ENTRIES.map((e) => [e.label, e] as const))("%s", (_label, entry) => {
        const out = run("something\n", entry.command);
        expect(typeof out).toBe("string");
        // Whatever it produced has to survive being read back, or the next person to open
        // the file sees something different from what they saved.
        expect(() => parseDocument(out)).not.toThrow();
    });
});

describe("the surface turns a paragraph into each thing it offers", () => {
    test.each([
        ["Heading 2", toggleHeading(2), "## something"],
        ["a bulleted list", toggleList("bullet_list"), "- something"],
        ["a numbered list", toggleList("ordered_list"), "1. something"],
        ["a quote", toggleQuote, "> something"],
        ["a code block", toggleCodeBlock, "```\nsomething\n```"],
    ])("%s", (_name, command, expected) => {
        expect(run("something\n", command).trim()).toBe(expected);
    });

    test("and back again, because every one of them toggles", () => {
        const once = run("something\n", toggleHeading(2));
        const parsed = parseDocument(once);
        let state = EditorState.create({ doc: parsed.doc, schema });
        state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(1))));
        toggleHeading(2)(state, (tr) => {
            state = state.apply(tr);
        });
        expect(serializeDocument(state.doc, parsed).trim()).toBe("something");
    });
});

describe("a table arrives with a header row, because GFM has no other kind", () => {
    test("three by three", () => {
        const parsed = parseDocument("x\n");
        let state = EditorState.create({ doc: parsed.doc, schema });
        state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(1))));
        insertTable(3, 3)(state, (tr) => {
            state = state.apply(tr);
        });
        const table = state.doc.children.find((n) => n.type.name === "table")!;
        expect(table.firstChild!.firstChild!.type.name).toBe("table_header");
        const markdown = serializeBlock(table);
        expect(markdown.split("\n")).toHaveLength(4);
        expect(markdown.split("\n")[1]).toMatch(/^\|\s*-+\s*\|/);
        // And it reads back as a table rather than three paragraphs of pipes.
        expect(parseDocument(markdown).doc.child(0).type.name).toBe("table");
    });
});

describe("the slash menu finds what someone is likely to type", () => {
    test.each([
        ["h1", "Heading 1"],
        ["head", "Heading 1"],
        ["bul", "Bulleted list"],
        ["ul", "Bulleted list"],
        ["quote", "Quote"],
        ["snippet", "Code"],
        ["hr", "Divider"],
        ["grid", "Table"],
    ])("%s finds %s", (query, label) => {
        expect(matching(query).map((e) => e.label)).toContain(label);
    });

    test("an empty query offers everything", () => {
        expect(matching("")).toHaveLength(ENTRIES.length);
    });

    test("a query that matches nothing offers nothing, rather than everything", () => {
        expect(matching("zzzz")).toEqual([]);
    });
});

describe("W-10 survives the commands, not only a quiet document", () => {
    const BODY = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\n- one\n- two\n";

    test("turning the second paragraph into a heading leaves the rest byte-identical", () => {
        const parsed = parseDocument(BODY);
        let state = EditorState.create({ doc: parsed.doc, schema });
        const at = state.doc.resolve(0).posAtIndex(2) + 1;
        state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(at))));
        toggleHeading(3)(state, (tr) => {
            state = state.apply(tr);
        });
        expect(serializeDocument(state.doc, parsed)).toBe(
            "# Title\n\nFirst paragraph.\n\n### Second paragraph.\n\n- one\n- two\n",
        );
    });

    test("a document nothing was done to is returned exactly", () => {
        const parsed = parseDocument(BODY);
        expect(serializeDocument(parsed.doc, parsed)).toBe(BODY);
    });
});
