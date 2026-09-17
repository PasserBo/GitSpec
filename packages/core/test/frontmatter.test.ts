import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
    locateFrontmatter,
    readBody,
    replaceBody,
    spliceFrontmatter,
    type FrontmatterValue,
} from "../src/frontmatter.ts";

const ROOT = join(import.meta.dir, "../../..");

async function corpus(): Promise<{ path: string; source: string }[]> {
    const found: { path: string; source: string }[] = [];
    async function walk(dir: string, rel: string) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const next = join(dir, entry.name);
            const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) await walk(next, nextRel);
            else if (entry.name.endsWith(".md")) found.push({ path: nextRel, source: await readFile(next, "utf8") });
        }
    }
    await walk(join(ROOT, "docs"), "docs");
    await walk(join(ROOT, "fixtures"), "fixtures");
    return found;
}

const FILES = await corpus();

describe("W-1: the corpus survives being edited with no edits", () => {
    test("there is a corpus to check", () => {
        expect(FILES.length).toBeGreaterThan(20);
    });

    test.each(FILES.map((f) => [f.path, f.source] as const))("%s is byte-identical", (_path, source) => {
        // Three ways of touching a file without changing it. Each is something the editor
        // does on every save, and none may produce a diff.
        expect(spliceFrontmatter(source, {})).toBe(source);
        expect(replaceBody(source, readBody(source))).toBe(source);

        // The strong one: hand back every value the file already holds, which is exactly
        // what a form does when the author edits nothing. Nothing may be rewritten.
        const located = locateFrontmatter(source);
        if (located.kind === "block") {
            expect(spliceFrontmatter(source, located.values as Record<string, FrontmatterValue>)).toBe(source);
        }
    });

    test("every document in the corpus is editable field by field", () => {
        const opaque = FILES.filter((f) => locateFrontmatter(f.source).kind === "opaque");
        expect(opaque.map((f) => f.path)).toEqual([]);
    });
});

const SPEC = await readFile(join(ROOT, "docs/specs/spec-format.md"), "utf8");

describe("W-1: an edit writes one field and nothing else", () => {
    test("changing status changes exactly one line", () => {
        const next = spliceFrontmatter(SPEC, { status: "active" });
        const before = SPEC.split("\n");
        const after = next.split("\n");
        expect(after.length).toBe(before.length);

        const differing = before.map((line, i) => [i, line, after[i]!] as const).filter(([, a, b]) => a !== b);
        expect(differing).toEqual([[4, "status: draft", "status: active"]]);
    });

    test("a value already equal to what the file says is not rewritten", () => {
        expect(spliceFrontmatter(SPEC, { status: "draft", owner: "@PasserBo" })).toBe(SPEC);
    });

    test("quoting style the author chose is kept when the value is unchanged", () => {
        // The file writes `owner: "@PasserBo"`. Re-emitting would also quote it, but the
        // point is that nothing is re-emitted at all.
        expect(spliceFrontmatter(SPEC, { owner: "@PasserBo" })).toContain('owner: "@PasserBo"');
    });

    test("the body is untouched by a frontmatter edit", () => {
        expect(readBody(spliceFrontmatter(SPEC, { status: "active" }))).toBe(readBody(SPEC));
    });

    test("a list is rewritten as a block list, and only that key moves", () => {
        const next = spliceFrontmatter(SPEC, { governs: ["packages/core/**", "apps/web/**"] });
        expect(next).toContain("governs:\n  - packages/core/**\n  - apps/web/**\n");
        expect(readBody(next)).toBe(readBody(SPEC));
        expect(locateFrontmatter(next).kind).toBe("block");
    });

    test("removing the last key takes its line and no blank line with it", () => {
        const next = spliceFrontmatter(SPEC, { verified_against: undefined });
        const located = locateFrontmatter(next);
        expect(located.kind).toBe("block");
        // The body mentions the key by name in F-5, so the check has to be on the block.
        if (located.kind === "block") expect([...located.keys.keys()]).not.toContain("verified_against");
        expect(next).toContain("governs: []\n---\n");
        expect(next.split("\n").length).toBe(SPEC.split("\n").length - 1);
        expect(readBody(next)).toBe(readBody(SPEC));
    });

    test("a key the file does not have is appended inside the block", () => {
        const next = spliceFrontmatter(SPEC, { reviewers: ["@a", "@b"] });
        const located = locateFrontmatter(next);
        expect(located.kind).toBe("block");
        if (located.kind === "block") expect(located.values.reviewers).toEqual(["@a", "@b"]);
        expect(readBody(next)).toBe(readBody(SPEC));
    });
});

describe("W-4: frontmatter that cannot be edited key by key is refused", () => {
    const opaque = (raw: string) => locateFrontmatter(`---\n${raw}\n---\n\n# Body\n`);

    test("a flow mapping", () => {
        expect(opaque("{ a: 1, b: 2 }").kind).toBe("opaque");
    });

    test("a duplicated key", () => {
        const located = opaque("id: one\nid: two");
        expect(located).toMatchObject({ kind: "opaque", reason: expect.stringContaining("more than once") });
    });

    test("a quoted key, which the line scan does not recognise", () => {
        expect(opaque('"my key": value').kind).toBe("opaque");
    });

    test("a merge key", () => {
        expect(opaque("<<: *defaults\nid: x").kind).toBe("opaque");
    });

    test("broken YAML", () => {
        expect(opaque("id: [unclosed").kind).toBe("opaque");
    });

    test("W-8: its body is still editable, and the block survives", () => {
        const source = "---\n{ a: 1 }\n---\n\n# Body\n";
        expect(readBody(source)).toBe("\n# Body\n");
        expect(replaceBody(source, "\n# Edited\n")).toBe("---\n{ a: 1 }\n---\n\n# Edited\n");
        // Asking nothing of the frontmatter is not the moment to refuse.
        expect(spliceFrontmatter(source, {})).toBe(source);
    });

    test("splicing one is refused rather than guessed at", () => {
        const source = "---\n{ a: 1 }\n---\n\n# Body\n";
        expect(() => spliceFrontmatter(source, { a: "2" })).toThrow(/field by field/);
    });
});

describe("documents with no frontmatter", () => {
    const PLAIN = "# A page\n\nSome prose.\n";

    test("are located as absent, not as broken", () => {
        expect(locateFrontmatter(PLAIN)).toEqual({ kind: "absent", bodyStart: 0 });
    });

    test("are all body", () => {
        expect(readBody(PLAIN)).toBe(PLAIN);
        expect(replaceBody(PLAIN, "# B\n")).toBe("# B\n");
    });

    test("gain a block only when something is actually set", () => {
        expect(spliceFrontmatter(PLAIN, {})).toBe(PLAIN);
        expect(spliceFrontmatter(PLAIN, { id: "a-page" })).toBe("---\nid: a-page\n---\n\n# A page\n\nSome prose.\n");
    });

    test("an empty block is a block with no keys", () => {
        const located = locateFrontmatter("---\n---\n\n# B\n");
        expect(located.kind).toBe("block");
        if (located.kind === "block") expect(located.keys.size).toBe(0);
    });
});

describe("values are emitted so they read back as themselves", () => {
    const round = (value: FrontmatterValue) => {
        const next = spliceFrontmatter("---\nid: x\n---\n\n# B\n", { v: value });
        const located = locateFrontmatter(next);
        if (located.kind !== "block") throw new Error("expected a block");
        return located.values.v;
    };

    test.each([
        ["plain", "active"],
        ["at-sign, a reserved indicator", "@PasserBo"],
        ["a word YAML 1.1 would call a boolean", "yes"],
        ["something that looks like a number", "1.0"],
        ["something that looks like null", "null"],
        ["a colon inside", "title: with colon"],
        ["a leading dash", "- not a list"],
        ["a hash", "value # not a comment"],
        ["empty", ""],
    ])("%s", (_name, value) => {
        expect(round(value)).toBe(value);
    });

    test("null stays null, not the string", () => {
        expect(round(null)).toBeNull();
    });

    test("an empty list is not dropped", () => {
        expect(round([])).toEqual([]);
    });

    test("comments and blank lines between keys survive an edit elsewhere", () => {
        const source = "---\n# why this id\nid: x\n\nstatus: draft\n---\n\n# B\n";
        expect(spliceFrontmatter(source, { status: "active" })).toBe(
            "---\n# why this id\nid: x\n\nstatus: active\n---\n\n# B\n",
        );
    });
});
