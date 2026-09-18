import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { discover, parseConfig } from "@gitspec/core";
import { renderSite } from "../src/site.ts";
import { assetOutputPath, hash8, looksLikeAsset } from "../src/assets.ts";

const FIXTURE = join(import.meta.dir, "../../../fixtures/assets");

const YAML = `
version: 1
site:
  title: Assets
spaces:
  - key: assets
    title: Assets
    path: /
    directory: ./docs
`;

async function build(base = "") {
    const warnings: string[] = [];
    const config = parseConfig(YAML);
    const discovery = await discover(FIXTURE, config);
    const files = await renderSite(FIXTURE, config, discovery, {
        base,
        repository: { owner: "o", name: "r", branch: "main" },
        onWarning: (m) => warnings.push(m),
    });
    const html = (path: string) => String(files.find((f) => f.path === path)!.contents);
    return { files, warnings, html };
}

describe("I-1: an asset is copied because a document points at it", () => {
    test("the referenced image is emitted, content-addressed", async () => {
        const { files } = await build();
        const assets = files.filter((f) => f.path.startsWith("_assets/"));
        expect(assets).toHaveLength(1);
        expect(assets[0]!.path).toMatch(/^_assets\/logo-[0-9a-f]{8}\.png$/);
    });

    test("the emitted file is the bytes, not a string of them", async () => {
        const { files } = await build();
        const asset = files.find((f) => f.path.startsWith("_assets/"))!;
        expect(asset.contents).toBeInstanceOf(Uint8Array);
        // A PNG signature, so this is the real file and not a decoding accident.
        expect([...(asset.contents as Uint8Array).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    test("the reference in the page points at it", async () => {
        const { files, html } = await build();
        const asset = files.find((f) => f.path.startsWith("_assets/"))!;
        expect(html("index.html")).toContain(`src="/${asset.path}"`);
    });

    test("nothing else in the repository is copied", async () => {
        const { files } = await build();
        expect(files.some((f) => f.path.endsWith(".ts"))).toBe(false);
    });
});

describe("I-2: the URL carries the content, so a changed image is never stale", () => {
    test("the hash in the name is the hash of the bytes", async () => {
        const { files } = await build();
        const asset = files.find((f) => f.path.startsWith("_assets/"))!;
        expect(asset.path).toBe(assetOutputPath("logo.png", await hash8(asset.contents as Uint8Array)));
    });
});

describe("I-6: one file, however many documents point at it", () => {
    test("two references produce one asset", async () => {
        const { files, html } = await build();
        expect(files.filter((f) => f.path.startsWith("_assets/"))).toHaveLength(1);
        const asset = files.find((f) => f.path.startsWith("_assets/"))!;
        expect(html("second/index.html")).toContain(`src="/${asset.path}"`);
    });
});

describe("I-5: a reference that resolves to nothing is said out loud", () => {
    test("the warning names the document and the reference", async () => {
        const { warnings } = await build();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("docs/README.md");
        expect(warnings[0]).toContain("docs/images/absent.png");
    });

    test("and the reference is left exactly as written, not rewritten to a guess", async () => {
        const { html } = await build();
        expect(html("index.html")).toContain('src="./images/absent.png"');
    });

    test("a link to source code is neither copied nor warned about", async () => {
        const { warnings, html } = await build();
        expect(warnings.join(" ")).not.toContain("schema.ts");
        expect(html("index.html")).toContain('href="../../../packages/core/src/schema.ts"');
    });

    test("an external image is untouched", async () => {
        const { html } = await build();
        expect(html("index.html")).toContain('src="https://example.test/x.png"');
    });
});

describe("R-5: an asset lives under the deployment prefix like everything else", () => {
    test("the src carries the base", async () => {
        const { files, html } = await build("/GitSpec");
        const asset = files.find((f) => f.path.startsWith("_assets/"))!;
        expect(html("index.html")).toContain(`src="/GitSpec/${asset.path}"`);
        // R-4: the prefix belongs to the deployment, never to the file layout.
        expect(asset.path.startsWith("_assets/")).toBe(true);
    });
});

describe("the manifest carries the map, so the editor can preview a committed image", () => {
    test("repository path to served URL", async () => {
        const { files } = await build("/GitSpec");
        const manifest = JSON.parse(String(files.find((f) => f.path === "_gitspec/manifest.json")!.contents));
        expect(manifest.assets["docs/images/logo.png"]).toMatch(/^\/GitSpec\/_assets\/logo-[0-9a-f]{8}\.png$/);
        expect(manifest.assets["docs/images/absent.png"]).toBeUndefined();
    });
});

describe("what may become an asset", () => {
    test.each([
        ["docs/a.png", true],
        ["docs/a.PNG", true],
        ["docs/a.pdf", true],
        ["docs/a.svg", true],
        ["packages/core/src/schema.ts", false],
        ["docs/README.md", false],
        ["Makefile", false],
    ])("%s → %s", (path, expected) => {
        expect(looksLikeAsset(path)).toBe(expected);
    });
});
