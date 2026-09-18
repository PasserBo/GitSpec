import { describe, expect, test } from "bun:test";
import { submitEdit } from "../src/submit.ts";
import { FakeRepo } from "./fake-repo.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function base(): FakeRepo {
    const repo = new FakeRepo();
    repo.seed("main", "docs/a.md", "# A\n");
    return repo;
}

describe("I-3: an asset rides the document's own branch and pull request", () => {
    test("both land on one branch, under one pull request", async () => {
        const repo = base();
        const result = await submitEdit(repo, {
            documentId: "a",
            path: "docs/a.md",
            contents: "# A\n\n![shot](./images/shot-abcd1234.png)\n",
            base: "main",
            attachments: [{ path: "docs/images/shot-abcd1234.png", contents: PNG }],
        });

        expect(result.created).toBe(true);
        expect(repo.pulls).toHaveLength(1);
        expect(repo.commits.map((c) => c.branch)).toEqual([result.branch, result.branch]);
    });

    test("the image is written before the paragraph that refers to it", async () => {
        const repo = base();
        await submitEdit(repo, {
            documentId: "a",
            path: "docs/a.md",
            contents: "# A\n\n![shot](./images/shot-abcd1234.png)\n",
            base: "main",
            attachments: [{ path: "docs/images/shot-abcd1234.png", contents: PNG }],
        });
        // Otherwise the branch briefly holds a document pointing at a file that is not
        // there, which is what someone opening the pull request early would see.
        expect(repo.commits.map((c) => c.path)).toEqual(["docs/images/shot-abcd1234.png", "docs/a.md"]);
    });

    test("the bytes survive the trip", async () => {
        const repo = base();
        await submitEdit(repo, {
            documentId: "a",
            path: "docs/a.md",
            contents: "# A\n\n![shot](./images/shot-abcd1234.png)\n",
            base: "main",
            attachments: [{ path: "docs/images/shot-abcd1234.png", contents: PNG }],
        });
        const written = repo.files.get(`gitspec/a:docs/images/shot-abcd1234.png`);
        expect(written).toBeDefined();
    });
});

describe("I-6: the same bytes are committed once", () => {
    test("a second edit re-sending the same asset adds no commit for it", async () => {
        const repo = base();
        const attachments = [{ path: "docs/images/shot-abcd1234.png", contents: PNG }];
        await submitEdit(repo, {
            documentId: "a",
            path: "docs/a.md",
            contents: "# A\n\n![shot](./images/shot-abcd1234.png)\n",
            base: "main",
            attachments,
        });
        const after = repo.commits.length;

        await submitEdit(repo, {
            documentId: "a",
            path: "docs/a.md",
            contents: "# A\n\n![shot](./images/shot-abcd1234.png)\n\nMore.\n",
            base: "main",
            attachments,
        });

        expect(repo.commits.slice(after).map((c) => c.path)).toEqual(["docs/a.md"]);
    });

    test("an edit with nothing new at all still proposes nothing", async () => {
        const repo = base();
        const submission = {
            documentId: "a",
            path: "docs/a.md",
            contents: "# A\n",
            base: "main",
            attachments: [],
        };
        expect(submitEdit(repo, submission)).rejects.toThrow(/nothing to propose/);
    });
});
