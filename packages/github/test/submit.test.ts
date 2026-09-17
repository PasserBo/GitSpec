import { describe, expect, test } from "bun:test";
import { branchNameFor, restRepo, SubmitError, submitEdit } from "../src/index.ts";
import { FakeRepo } from "./fake-repo.ts";

const edit = (over: Partial<Parameters<typeof submitEdit>[1]> = {}) => ({
    documentId: "spec-format",
    path: "docs/specs/spec-format.md",
    contents: "new text",
    base: "main",
    ...over,
});

describe("branchNameFor", () => {
    test.each([
        ["spec-format", "gitspec/spec-format"],
        ["Spec Format", "gitspec/spec-format"],
        ["--weird--", "gitspec/weird"],
        ["", "gitspec/document"],
    ])("%p → %p", (id, want) => {
        expect(branchNameFor(id)).toBe(want);
    });

    test("later attempts are suffixed rather than reusing a spent branch", () => {
        expect(branchNameFor("spec-format", 2)).toBe("gitspec/spec-format-2");
    });
});

describe("E-1: an edit never lands on the default branch", () => {
    test("the commit goes to a new branch", async () => {
        const repo = new FakeRepo();
        const result = await submitEdit(repo, edit());

        expect(result.branch).toBe("gitspec/spec-format");
        expect(repo.commits).toHaveLength(1);
        expect(repo.commits[0]!.branch).toBe("gitspec/spec-format");
        expect(repo.commits.some((c) => c.branch === "main")).toBe(false);
    });

    test("a missing base branch is refused before anything is written", async () => {
        const repo = new FakeRepo();
        repo.branches.delete("main");

        await expect(submitEdit(repo, edit())).rejects.toThrow(SubmitError);
        expect(repo.commits).toHaveLength(0);
        expect(repo.pulls).toHaveLength(0);
    });
});

describe("E-2 / E-3: one document, one pull request", () => {
    test("a second edit appends to the open pull request", async () => {
        const repo = new FakeRepo();
        const first = await submitEdit(repo, edit());
        const second = await submitEdit(repo, edit({ contents: "newer text" }));

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(second.pull.number).toBe(first.pull.number);
        expect(second.branch).toBe(first.branch);
        expect(repo.pulls).toHaveLength(1);
        expect(repo.commits).toHaveLength(2);
    });

    test("the append builds on the branch, not on base", async () => {
        const repo = new FakeRepo();
        await submitEdit(repo, edit());
        await submitEdit(repo, edit({ contents: "newer text" }));

        // The second commit replaces the blob the first one wrote. Reading base instead
        // would silently discard the first edit.
        expect(repo.commits[1]!.sha).toBe("sha-1");
    });

    test("a different document gets its own branch and pull request", async () => {
        const repo = new FakeRepo();
        await submitEdit(repo, edit());
        const other = await submitEdit(
            repo,
            edit({ documentId: "drift-detection", path: "docs/specs/drift-detection.md" }),
        );

        expect(other.created).toBe(true);
        expect(other.branch).toBe("gitspec/drift-detection");
        expect(repo.pulls).toHaveLength(2);
    });

    test("an unchanged append is a no-op rather than an empty commit", async () => {
        const repo = new FakeRepo();
        await submitEdit(repo, edit());
        const again = await submitEdit(repo, edit());

        expect(again.created).toBe(false);
        expect(repo.commits).toHaveLength(1);
    });
});

describe("A-4: a spent branch is left alone", () => {
    test("once its pull request closes, the next edit takes a new branch", async () => {
        const repo = new FakeRepo();
        await submitEdit(repo, edit());
        repo.pulls[0]!.open = false;
        const tipBefore = repo.branches.get("gitspec/spec-format");

        const next = await submitEdit(repo, edit({ contents: "text after the merge" }));

        expect(next.branch).toBe("gitspec/spec-format-2");
        expect(next.created).toBe(true);
        // Untouched: not reset to base, not force-pushed, not deleted.
        expect(repo.branches.get("gitspec/spec-format")).toBe(tipBefore);
    });
});

describe("C-2: a refused write is reported, not retried", () => {
    test("the failure propagates and nothing further is attempted", async () => {
        const repo = new FakeRepo();
        repo.putFile = async () => {
            throw new SubmitError("C-2", "the branch moved");
        };

        await expect(submitEdit(repo, edit())).rejects.toThrow(/C-2/);
        expect(repo.pulls).toHaveLength(0);
    });
});

describe("E-5: an agent's edit is marked, not re-attributed", () => {
    test("trailers reach the commit message", async () => {
        const repo = new FakeRepo();
        await submitEdit(repo, edit({ trailers: { "GitSpec-Agent": "claude" } }));

        expect(repo.commits[0]!.message).toContain("GitSpec-Agent: claude");
    });
});

describe("a missing app permission explains itself", () => {
    // GitHub's own words are "Resource not accessible by integration", which names
    // neither the permission nor the app, and sends people to look at their own account
    // access rather than at the app's grant.
    test("a 403 from the integration is translated into what to change", async () => {
        const repo = restRepo({
            owner: "o",
            repo: "r",
            token: "t",
            fetch: (async () =>
                new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
                    status: 403,
                })) as unknown as typeof fetch,
        });

        const error = (await repo.createBranch("gitspec/x", "sha").catch((e) => e)) as SubmitError;
        expect(error).toBeInstanceOf(SubmitError);
        expect(error.message).toContain("Read and write");
        expect(error.message).toContain("accept the updated permissions");
    });

    test("an unrelated failure keeps GitHub's own message", async () => {
        const repo = restRepo({
            owner: "o",
            repo: "r",
            token: "t",
            fetch: (async () =>
                new Response(JSON.stringify({ message: "Reference already exists" }), {
                    status: 422,
                })) as unknown as typeof fetch,
        });

        const error = (await repo.createBranch("gitspec/x", "sha").catch((e) => e)) as SubmitError;
        expect(error.message).toContain("Reference already exists");
    });
});
