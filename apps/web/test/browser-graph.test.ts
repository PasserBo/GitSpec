import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * What the browser bundles is allowed to reach.
 *
 * `Bun.build({ target: "browser" })` does not refuse a Node module. It stubs it, the
 * build succeeds, and the failure waits until someone opens the page. That is how
 * `const run = promisify(execFile)` — a single line in a build-time module, pulled in
 * through a barrel export — shipped an editor that threw during module evaluation and
 * sat on "Loading…" saying nothing.
 *
 * Tree shaking is not the guard: it removes unused functions, not module-level work. The
 * guard is that a browser entry cannot reach those modules at all, and this test is what
 * makes that true rather than merely intended.
 */

const REPO = resolve(import.meta.dir, "../../..");

/** Bun polyfills this one for the browser, and the URL rewriting genuinely needs it. */
const ALLOWED_BUILTINS = new Set(["node:path"]);

/** Bare specifiers that resolve inside this repository. */
const WORKSPACE: Record<string, string> = {
    "@gitspec/core": "packages/core/src/index.ts",
    "@gitspec/core/browser": "packages/core/src/browser.ts",
    "@gitspec/render": "packages/render/src/index.ts",
    "@gitspec/render/browser": "packages/render/src/browser.ts",
    "@gitspec/github": "packages/github/src/index.ts",
};

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?[\s\S]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;

async function reachableFrom(entry: string): Promise<{ files: Set<string>; builtins: Map<string, string> }> {
    const files = new Set<string>();
    const builtins = new Map<string, string>();
    const queue = [resolve(REPO, entry)];

    while (queue.length > 0) {
        const file = queue.pop()!;
        if (files.has(file)) continue;
        files.add(file);

        let source: string;
        try {
            source = await readFile(file, "utf8");
        } catch {
            continue;
        }

        for (const match of source.matchAll(IMPORT)) {
            // `import type { X } from "y"` is erased before anything runs, so it cannot
            // drag a module into the bundle.
            if (match[1]) continue;
            const specifier = match[2] ?? match[3];
            if (!specifier) continue;

            if (specifier.startsWith("node:")) {
                if (!builtins.has(specifier)) builtins.set(specifier, file);
                continue;
            }
            if (specifier.startsWith(".")) {
                queue.push(resolve(dirname(file), specifier));
                continue;
            }
            const workspace = WORKSPACE[specifier];
            if (workspace) queue.push(join(REPO, workspace));
            // Anything else is a published package. Whether it works in a browser is its
            // own claim to make, and the bundler's to enforce.
        }
    }

    return { files, builtins };
}

const ENTRIES = ["apps/web/src/editor.ts", "apps/web/src/setup.ts"];

describe("a browser entry reaches no build-time module", () => {
    test.each(ENTRIES)("%s", async (entry) => {
        const { builtins } = await reachableFrom(entry);
        const forbidden = [...builtins]
            .filter(([name]) => !ALLOWED_BUILTINS.has(name))
            .map(([name, via]) => `${name} via ${via.slice(REPO.length + 1)}`);
        expect(forbidden).toEqual([]);
    });

    test.each(ENTRIES)("%s does not import a package barrel", async (entry) => {
        const source = await readFile(resolve(REPO, entry), "utf8");
        // The barrels re-export the build. Importing one puts every module behind it in
        // the graph, and then only tree shaking stands between the page and `Bun.build`.
        expect(source).not.toMatch(/from\s+["']@gitspec\/(core|render)["']/);
    });

    test("the walk actually reaches the modules it is meant to police", async () => {
        // Without this, a broken resolver would make every assertion above pass by
        // finding nothing at all.
        const { files } = await reachableFrom("apps/web/src/editor.ts");
        const seen = [...files].map((f) => f.slice(REPO.length + 1));
        expect(seen).toContain("packages/core/src/frontmatter.ts");
        expect(seen).toContain("packages/render/src/markdown.ts");
        expect(seen).toContain("packages/github/src/rest.ts");
        expect(seen).not.toContain("packages/render/src/history.ts");
        expect(seen).not.toContain("packages/render/src/bundle.ts");
        expect(seen).not.toContain("packages/core/src/discover.ts");
    });
});
