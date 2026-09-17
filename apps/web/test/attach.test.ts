import { describe, expect, test } from "bun:test";
import { assetNameFor, checkAsset, markdownFor, prepareAsset, referenced } from "../src/attach.ts";
import { MAX_ASSET_BYTES } from "@gitspec/render";

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

describe("I-4: what will not be accepted, and why", () => {
    test("a file over the limit names the limit", () => {
        const refusal = checkAsset("big.png", MAX_ASSET_BYTES + 1);
        expect(refusal).toContain("1024 kB limit");
    });

    test("exactly at the limit is fine: it is the largest readable file, not the first bad one", () => {
        expect(checkAsset("big.png", MAX_ASSET_BYTES)).toBeUndefined();
    });

    test("a kind of file GitSpec does not publish is refused before it is read", () => {
        expect(checkAsset("payload.ts", 10)).toContain("not a kind of file");
        expect(checkAsset("notes.md", 10)).toContain("not a kind of file");
    });

    test("an ordinary screenshot is accepted", () => {
        expect(checkAsset("Screenshot 2026-09-18 at 04.31.22.png", 240_000)).toBeUndefined();
    });
});

describe("I-2 and I-6: the path is the content", () => {
    test("the same bytes always land on the same path", async () => {
        const a = await prepareAsset("docs/specs/authoring.md", "shot.png", bytes(100));
        const b = await prepareAsset("docs/specs/authoring.md", "shot.png", bytes(100));
        expect(a.repoPath).toBe(b.repoPath);
    });

    test("different bytes do not", async () => {
        const a = await prepareAsset("docs/specs/authoring.md", "shot.png", bytes(100, 1));
        const b = await prepareAsset("docs/specs/authoring.md", "shot.png", bytes(100, 2));
        expect(a.repoPath).not.toBe(b.repoPath);
    });

    test("an asset lives beside the document that uses it", async () => {
        const asset = await prepareAsset("docs/specs/authoring.md", "shot.png", bytes(10));
        expect(asset.repoPath).toMatch(/^docs\/specs\/images\/shot-[0-9a-f]{8}\.png$/);
        // Relative, so it still resolves when the file is read on GitHub rather than
        // through the built site.
        expect(asset.reference).toMatch(/^\.\/images\/shot-[0-9a-f]{8}\.png$/);
        expect(asset.repoPath.endsWith(asset.reference.slice(2))).toBe(true);
    });

    test("a name a person's screenshot tool produced becomes a usable one", () => {
        expect(assetNameFor("Screenshot 2026-09-18 at 04.31.22.PNG", "abcd1234")).toBe(
            "screenshot-2026-09-18-at-04-31-22-abcd1234.png",
        );
    });
});

describe("what gets typed into the document", () => {
    test("an image shows", async () => {
        const asset = await prepareAsset("docs/a.md", "diagram.png", bytes(4));
        expect(markdownFor(asset, "diagram.png")).toBe(`![diagram](${asset.reference})`);
    });

    test("anything else is a link to it", async () => {
        const asset = await prepareAsset("docs/a.md", "spec.pdf", bytes(4));
        expect(markdownFor(asset, "spec.pdf")).toBe(`[spec](${asset.reference})`);
    });
});

describe("a paste the author then deleted is not committed", () => {
    test("only what the body still points at is sent", async () => {
        const kept = await prepareAsset("docs/a.md", "kept.png", bytes(4, 1));
        const dropped = await prepareAsset("docs/a.md", "dropped.png", bytes(4, 2));
        const body = `# A\n\n${markdownFor(kept, "kept.png")}\n`;
        expect(referenced([kept, dropped], body)).toEqual([kept]);
    });
});
