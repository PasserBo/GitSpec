import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discover, parseConfig } from "@gitspec/core";
import { normalizeBase, renderSite, withBase } from "../src/index.ts";

const FIXTURE = join(import.meta.dir, "../../../fixtures/simple");

describe("normalizeBase", () => {
    test.each([
        [undefined, ""],
        ["", ""],
        ["/", ""],
        ["GitSpec", "/GitSpec"],
        ["/GitSpec", "/GitSpec"],
        ["/GitSpec/", "/GitSpec"],
        ["//GitSpec//", "/GitSpec"],
    ])("%p → %p", (input, want) => {
        expect(normalizeBase(input)).toBe(want);
    });
});

describe("withBase", () => {
    test("the space root keeps a trailing slash so it is not read as a sibling", () => {
        expect(withBase("/GitSpec", "/")).toBe("/GitSpec/");
    });

    test("an ordinary address is prefixed", () => {
        expect(withBase("/GitSpec", "/spec-format")).toBe("/GitSpec/spec-format");
    });

    test("no base leaves the address alone", () => {
        expect(withBase("", "/spec-format")).toBe("/spec-format");
    });
});

async function render(base?: string) {
    const config = parseConfig(await readFile(join(FIXTURE, "gitspec.yaml"), "utf8"));
    const discovery = await discover(FIXTURE, config);
    return renderSite(FIXTURE, config, discovery, { base });
}

describe("renderSite with a base", () => {
    test("every internal href carries the prefix", async () => {
        const files = await render("/GitSpec");
        const home = files.find((f) => f.path === "index.html")!;
        const hrefs = [...home.contents.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);

        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) {
            expect(href.startsWith("/GitSpec/")).toBe(true);
        }
    });

    // R-4: the prefix belongs to the deployment. If it leaked into the file layout the
    // artifact would end up served at /GitSpec/GitSpec/.
    test("output paths are unaffected", async () => {
        const withPrefix = (await render("/GitSpec")).map((f) => f.path).sort();
        const without = (await render()).map((f) => f.path).sort();
        expect(withPrefix).toEqual(without);
    });

    test("no base produces root-relative hrefs", async () => {
        const files = await render();
        const home = files.find((f) => f.path === "index.html")!;
        expect(home.contents).toContain('href="/alpha"');
        expect(home.contents).not.toContain("/GitSpec/");
    });
});
