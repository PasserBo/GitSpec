import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { discover, DiscoveryError, parseConfig } from "../src/index.ts";
import type { DocumentKind } from "../src/index.ts";

const FIXTURES = join(import.meta.dir, "../../../fixtures");

interface ExpectedOk {
    result: "ok";
    documents: { id: string; path: string; id_derived?: boolean; kind?: DocumentKind; address?: string }[];
    excluded?: { path: string; by: string }[];
    navigation?: "from-summary" | "inferred";
    summary_path?: string;
    navigation_targets?: string[];
}

interface ExpectedError {
    result: "error";
    rule: string;
    message_must_name: string[];
}

/** Every directory holding a `gitspec.yaml`, at any depth under fixtures/. */
async function fixtureRoots(dir = FIXTURES, rel = ""): Promise<string[]> {
    const found: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        const child = join(dir, entry.name);
        const names = await readdir(child);
        if (names.includes("gitspec.yaml")) found.push(childRel);
        else found.push(...(await fixtureRoots(child, childRel)));
    }
    return found.sort();
}

async function run(root: string) {
    const config = parseConfig(await readFile(join(root, "gitspec.yaml"), "utf8"));
    return discover(root, config);
}

const roots = await fixtureRoots();

// The fixture set is the reason to trust any of this; an empty one would make every
// assertion below vacuously pass.
test("fixtures are present", () => {
    expect(roots.length).toBeGreaterThanOrEqual(7);
});

describe.each(roots)("%s", (name) => {
    const root = join(FIXTURES, name);

    test("matches expected.yaml", async () => {
        const expected = parseYaml(await readFile(join(root, "expected.yaml"), "utf8")) as
            | ExpectedOk
            | ExpectedError;

        if (expected.result === "error") {
            let thrown: unknown;
            try {
                await run(root);
            } catch (error) {
                thrown = error;
            }

            expect(thrown).toBeInstanceOf(DiscoveryError);
            const error = thrown as DiscoveryError;
            expect(error.rule).toBe(expected.rule);
            // Naming the offending file, glob or space is most of the value of failing,
            // so it is asserted rather than left to the implementer's taste.
            for (const needle of expected.message_must_name) {
                expect(error.message).toContain(needle);
            }
            return;
        }

        const result = await run(root);
        const documents = result.spaces.flatMap((space) => space.documents);

        expect(documents.map((d) => d.path).sort()).toEqual(
            expected.documents.map((d) => d.path).sort(),
        );

        for (const want of expected.documents) {
            const got = documents.find((d) => d.path === want.path);
            expect(got, `no document discovered at ${want.path}`).toBeDefined();
            expect(got!.id).toBe(want.id);
            expect(got!.idDerived).toBe(want.id_derived === true);
            if (want.kind) expect(got!.kind).toBe(want.kind);
            // A-6 is the rule most likely to be got wrong twice: once in core and once
            // again by anything that renders links, so the address is pinned here.
            if (want.address) expect(got!.address).toBe(want.address);
        }

        for (const { path } of expected.excluded ?? []) {
            expect(documents.map((d) => d.path)).not.toContain(path);
        }

        if (expected.navigation) {
            const nav = result.spaces[0]!.navigation;
            expect(nav.source).toBe(expected.navigation === "from-summary" ? "summary" : "inferred");
            if (nav.source === "summary") {
                if (expected.summary_path) expect(nav.summaryPath).toBe(expected.summary_path);
                if (expected.navigation_targets) {
                    expect(nav.targets.sort()).toEqual([...expected.navigation_targets].sort());
                }
            }
        }
    });
});
