import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateConfig, planSetup, siteUrlFor, type RepoFacts } from "../src/plan.ts";

const AUTH = { clientId: "Iv23liEXAMPLE", broker: "https://broker.example" };
const WORKFLOW = "name: Docs\n";

const facts = (over: Partial<RepoFacts> = {}): RepoFacts => ({
    owner: "PasserBo",
    name: "some-repo",
    defaultBranch: "main",
    hasGitspecYaml: false,
    hasDocsDir: false,
    hasDocsReadme: false,
    ...over,
});

function propose(f: RepoFacts) {
    const plan = planSetup(f, AUTH, WORKFLOW);
    if (plan.kind !== "propose") throw new Error(`expected a proposal, got ${plan.kind}`);
    return plan;
}

describe("O-2: setup only adds", () => {
    test("an existing gitspec.yaml means there is nothing to propose", () => {
        const plan = planSetup(facts({ hasGitspecYaml: true }), AUTH, WORKFLOW);
        expect(plan.kind).toBe("already");
        if (plan.kind === "already") expect(plan.reason).toContain("gitspec.yaml");
    });
});

describe("O-6: the generated site builds first time", () => {
    test("a bare repository gets config, workflow, and a home page", () => {
        const plan = propose(facts());
        expect(plan.files.map((f) => f.path)).toEqual([
            "gitspec.yaml",
            ".github/workflows/docs.yml",
            "docs/README.md",
        ]);
        expect(plan.notes.join(" ")).toContain("no docs/ directory");
    });

    test("docs/ without a README still gets one, with a different explanation", () => {
        const plan = propose(facts({ hasDocsDir: true }));
        expect(plan.files.map((f) => f.path)).toContain("docs/README.md");
        expect(plan.notes.join(" ")).toContain("has no README.md");
    });

    test("an existing docs/README.md is left alone", () => {
        const plan = propose(facts({ hasDocsDir: true, hasDocsReadme: true }));
        expect(plan.files.map((f) => f.path)).toEqual(["gitspec.yaml", ".github/workflows/docs.yml"]);
        expect(plan.notes).toEqual([]);
    });

    test("the home page declares an id, so its address does not depend on its path", () => {
        const home = propose(facts()).files.find((f) => f.path === "docs/README.md")!;
        expect(home.contents).toMatch(/^---\nkind: page\nid: home\n/);
    });
});

describe("the generated gitspec.yaml", () => {
    test("names the repository and its default branch, and carries sign-in", () => {
        const yaml = generateConfig(facts({ defaultBranch: "trunk" }), AUTH);
        expect(yaml).toContain('owner: "PasserBo"');
        expect(yaml).toContain('name: "some-repo"');
        expect(yaml).toContain('branch: "trunk"');
        expect(yaml).toContain(`clientId: "${AUTH.clientId}"`);
        expect(yaml).toContain(`broker: "${AUTH.broker}"`);
        expect(yaml).toContain("directory: ./docs");
    });

    test("is a config our own parser accepts", async () => {
        const { parseConfig } = await import("@gitspec/core");
        const config = parseConfig(generateConfig(facts(), AUTH));
        expect(config.repository).toEqual({ owner: "PasserBo", name: "some-repo", branch: "main" });
        expect(config.auth).toMatchObject(AUTH);
        expect(config.spaces[0]!.directory).toBe("./docs");
        // Adopter sites must not grow a setup portal of their own.
        expect(config.site.setup).toBe(false);
    });

    test("quotes values, so a name that looks like YAML syntax stays a string", () => {
        const yaml = generateConfig(facts({ name: "yes" }), AUTH);
        expect(yaml).toContain('name: "yes"');
    });
});

describe("the installed workflow is the documented one", () => {
    test("byte for byte", async () => {
        const documented = await readFile(join(import.meta.dir, "../../../examples/docs.yml"), "utf8");
        const plan = propose(facts());
        // The planner is handed the template; in the bundle it is imported from the same
        // file, so this pins that the two cannot diverge by construction.
        const fromDocumented = planSetup(facts(), AUTH, documented);
        if (fromDocumented.kind !== "propose") throw new Error("expected a proposal");
        expect(fromDocumented.files.find((f) => f.path.endsWith("docs.yml"))!.contents).toBe(documented);
        expect(plan.files.find((f) => f.path.endsWith("docs.yml"))!.contents).toBe(WORKFLOW);
    });
});

describe("siteUrlFor", () => {
    test.each([
        ["PasserBo", "GitSpec", "https://passerbo.github.io/GitSpec/"],
        ["PasserBo", "passerbo.github.io", "https://passerbo.github.io/"],
        ["Some-Org", "Docs", "https://some-org.github.io/Docs/"],
    ])("%s/%s → %s", (owner, name, want) => {
        expect(siteUrlFor(owner, name)).toBe(want);
    });

    test("a user site gets a note about the base path", () => {
        const plan = propose(facts({ owner: "PasserBo", name: "passerbo.github.io" }));
        expect(plan.notes.join(" ")).toContain("user site");
    });
});
