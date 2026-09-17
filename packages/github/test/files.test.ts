import { describe, expect, test } from "bun:test";
import { SubmitError, submitFiles } from "../src/index.ts";
import { FakeRepo } from "./fake-repo.ts";

const SETUP = {
    branchId: "setup",
    base: "main",
    title: "chore: set up GitSpec",
    body: "Adds the configuration GitSpec needs.",
    addOnly: true,
    files: [
        { path: "gitspec.yaml", contents: "version: 1\n" },
        { path: ".github/workflows/docs.yml", contents: "name: Docs\n" },
        { path: "docs/README.md", contents: "# Docs\n" },
    ],
};

describe("O-1: setup proposes through a pull request", () => {
    test("three files become three commits on one branch and one pull request", async () => {
        const repo = new FakeRepo();
        const result = await submitFiles(repo, SETUP);

        expect(result.branch).toBe("gitspec/setup");
        expect(result.created).toBe(true);
        expect(result.written).toEqual(SETUP.files.map((f) => f.path));
        expect(repo.commits).toHaveLength(3);
        expect(repo.pulls).toHaveLength(1);
        expect(repo.commits.every((c) => c.branch === "gitspec/setup")).toBe(true);
    });

    test("nothing ever lands on the default branch", async () => {
        const repo = new FakeRepo();
        await submitFiles(repo, SETUP);

        expect(repo.commits.some((c) => c.branch === "main")).toBe(false);
        expect(repo.branches.get("main")).toBe("base-sha");
    });

    test("each commit names the file it adds", async () => {
        const repo = new FakeRepo();
        await submitFiles(repo, SETUP);

        expect(repo.commits.map((c) => c.message)).toEqual([
            "chore: set up GitSpec: gitspec.yaml",
            "chore: set up GitSpec: .github/workflows/docs.yml",
            "chore: set up GitSpec: docs/README.md",
        ]);
    });
});

describe("O-2: setup only adds files", () => {
    test("an existing target on base is refused before anything is created", async () => {
        const repo = new FakeRepo();
        repo.seed("main", "gitspec.yaml", "someone else's config");

        const error = (await submitFiles(repo, SETUP).catch((e) => e)) as SubmitError;
        expect(error).toBeInstanceOf(SubmitError);
        expect(error.rule).toBe("C-3");
        expect(error.message).toContain("gitspec.yaml");
        // Refused cleanly: no branch, no commit, no pull request left behind.
        expect(repo.branches.has("gitspec/setup")).toBe(false);
        expect(repo.commits).toHaveLength(0);
        expect(repo.pulls).toHaveLength(0);
    });

    test("without addOnly an existing file is updated, not refused", async () => {
        const repo = new FakeRepo();
        repo.seed("main", "gitspec.yaml", "old");

        const result = await submitFiles(repo, { ...SETUP, addOnly: false });
        expect(result.written).toContain("gitspec.yaml");
        // The write carried the blob sha it replaced, so GitHub sees an update.
        expect(repo.commits.find((c) => c.path === "gitspec.yaml")!.sha).toBe("seed-gitspec.yaml");
    });
});

describe("E-2 / E-3 apply to setup too", () => {
    test("a rerun finds the open pull request and appends rather than opening another", async () => {
        const repo = new FakeRepo();
        const first = await submitFiles(repo, SETUP);
        const second = await submitFiles(repo, {
            ...SETUP,
            files: [...SETUP.files.slice(0, 2), { path: "docs/README.md", contents: "# Docs\n\nrevised\n" }],
        });

        expect(second.created).toBe(false);
        expect(second.pull.number).toBe(first.pull.number);
        expect(repo.pulls).toHaveLength(1);
        // Only the file whose contents changed was written again.
        expect(second.written).toEqual(["docs/README.md"]);
    });

    test("a rerun with identical contents writes nothing", async () => {
        const repo = new FakeRepo();
        await submitFiles(repo, SETUP);
        const again = await submitFiles(repo, SETUP);

        expect(again.written).toEqual([]);
        expect(repo.commits).toHaveLength(3);
    });
});

describe("refusals that leave no trace", () => {
    test.each([
        ["no files", { ...SETUP, files: [] }],
        ["a path listed twice", { ...SETUP, files: [SETUP.files[0]!, SETUP.files[0]!] }],
        ["an empty path", { ...SETUP, files: [{ path: "", contents: "x" }] }],
    ])("%s", async (_, submission) => {
        const repo = new FakeRepo();
        await expect(submitFiles(repo, submission)).rejects.toThrow(SubmitError);
        expect(repo.commits).toHaveLength(0);
        expect(repo.pulls).toHaveLength(0);
    });

    test("a missing base branch", async () => {
        const repo = new FakeRepo();
        repo.branches.delete("main");
        await expect(submitFiles(repo, SETUP)).rejects.toThrow(/does not exist/);
        expect(repo.pulls).toHaveLength(0);
    });
});

describe("E-5 trailers", () => {
    test("reach every commit", async () => {
        const repo = new FakeRepo();
        await submitFiles(repo, { ...SETUP, trailers: { "GitSpec-Setup": "1" } });
        expect(repo.commits.every((c) => c.message.includes("GitSpec-Setup: 1"))).toBe(true);
    });
});
