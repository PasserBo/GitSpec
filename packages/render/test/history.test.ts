import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHistory } from "../src/history.ts";

const ROOT = join(import.meta.dir, "../../..");
const HISTORY = await readHistory(ROOT);

describe("F-7: the dates come from the repository", () => {
    test("this checkout has history to read", () => {
        // Guards the whole file: a shallow clone would make every assertion below pass
        // vacuously, which is exactly the silent wrongness F-7 exists to avoid.
        expect(HISTORY.size).toBeGreaterThan(20);
    });

    test("a document is dated from the commit that added it", () => {
        // The commit that introduced the spec format. It cannot move.
        expect(HISTORY.get("docs/specs/spec-format.md")?.created).toBe("2026-09-15");
    });

    test("and from the newest commit that touched it", () => {
        const spec = HISTORY.get("docs/specs/spec-format.md")!;
        expect(spec.updated! >= spec.created!).toBe(true);
    });

    test("every date is a plain calendar day", () => {
        for (const [path, { created, updated }] of HISTORY) {
            expect(created, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(updated, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(created! <= updated!, path).toBe(true);
        }
    });

    test("a file the repository never had has no dates, rather than invented ones", () => {
        expect(HISTORY.get("docs/specs/never-written.md")).toBeUndefined();
    });

    test("a filename is never mistaken for a date line", () => {
        // The record marker is a control character precisely because a path could
        // otherwise look like one.
        expect([...HISTORY.keys()].some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))).toBe(false);
    });
});

describe("somewhere that cannot answer", () => {
    test("a directory that is not a repository yields nothing and throws nothing", async () => {
        const dir = await mkdtemp(join(tmpdir(), "gitspec-history-"));
        await writeFile(join(dir, "README.md"), "# Not a repository\n");
        expect(await readHistory(dir)).toEqual(new Map());
    });
});
