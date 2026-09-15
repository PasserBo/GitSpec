import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config, DiscoveryResult } from "@gitspec/core";
import { normalizeBase } from "./base.ts";
import { buildNav, renderPage } from "./layout.ts";
import { renderMarkdown, stripFrontmatter } from "./markdown.ts";

export interface RenderedFile {
    /** Output path relative to the site root, e.g. `index.html`, `spec-format/index.html`. */
    path: string;
    contents: string;
}

/** `/` → `index.html`; `/spec-format` → `spec-format/index.html`. Directory-style URLs, so links need no extension. */
function outputPathFor(address: string): string {
    const trimmed = address.replace(/^\/+/, "").replace(/\/+$/, "");
    return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

/**
 * R-3: rendering reads the repository and returns files. It opens nothing for writing and
 * calls nothing over the network, so the reading path cannot affect what it renders.
 */
export interface RenderOptions {
    /** Path the site is mounted at, e.g. `/GitSpec` for a GitHub Pages project site. */
    base?: string;
}

export async function renderSite(
    root: string,
    config: Config,
    discovery: DiscoveryResult,
    options: RenderOptions = {},
): Promise<RenderedFile[]> {
    const base = normalizeBase(options.base);
    // One lookup across every space: a link may cross from one space into another, and
    // resolving it needs the target's address, which only discovery knows.
    const addressByPath = new Map<string, string>();
    for (const space of discovery.spaces) {
        for (const document of space.documents) {
            addressByPath.set(document.path, document.address);
        }
    }
    const lookup = (path: string) => addressByPath.get(path);

    const files: RenderedFile[] = [];
    for (const space of discovery.spaces) {
        for (const document of space.documents) {
            const source = await readFile(join(root, document.path), "utf8");
            const content = await renderMarkdown(document, stripFrontmatter(source), lookup, base);
            files.push({
                path: outputPathFor(document.address),
                contents: renderPage({
                    siteTitle: config.site.title || space.title,
                    space,
                    document,
                    nav: buildNav(space, document, base),
                    base,
                    content,
                }),
            });
        }
    }

    return files;
}
