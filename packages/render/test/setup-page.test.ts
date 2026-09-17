import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { discover, parseConfig } from "@gitspec/core";
import { renderSite } from "../src/index.ts";

const FIXTURE = join(import.meta.dir, "../../../fixtures/simple");

const BASE_YAML = `
version: 1
site:
  title: Simple
spaces:
  - key: simple-docs
    title: Docs
    path: /
    directory: ./docs
`;
const AUTH = { clientId: "Iv23liEXAMPLE", broker: "https://broker.example" };

async function build(yaml: string, options: { auth?: typeof AUTH; setupBundle?: string }) {
    const config = parseConfig(yaml);
    const discovery = await discover(FIXTURE, config);
    const files = await renderSite(FIXTURE, config, discovery, options);
    return files.map((f) => f.path);
}

describe("O-4: the setup page is emitted only by the site that opts in", () => {
    test("site.setup with sign-in configured emits the page and its bundle", async () => {
        const paths = await build(BASE_YAML.replace("title: Simple", "title: Simple\n  setup: true"), {
            auth: AUTH,
            setupBundle: "// bundle",
        });
        expect(paths).toContain("_setup/index.html");
        expect(paths).toContain("_gitspec/setup.js");
    });

    test("without site.setup nothing is emitted, even with sign-in and a bundle", async () => {
        const paths = await build(BASE_YAML, { auth: AUTH, setupBundle: "// bundle" });
        expect(paths).not.toContain("_setup/index.html");
        expect(paths).not.toContain("_gitspec/setup.js");
    });

    test("site.setup without sign-in emits nothing: there is no way to act as anyone", async () => {
        const paths = await build(BASE_YAML.replace("title: Simple", "title: Simple\n  setup: true"), {
            setupBundle: "// bundle",
        });
        expect(paths).not.toContain("_setup/index.html");
    });

    test("the flag defaults to off", () => {
        expect(parseConfig(BASE_YAML).site.setup).toBe(false);
    });
});
