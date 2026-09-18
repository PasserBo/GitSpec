import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config, DiscoveryResult } from "@gitspec/core";
import { normalizeBase } from "./base.ts";
import { appPage, editorPage } from "./editor-page.ts";
import { buildNav, renderPage } from "./layout.ts";
import { buildManifest, type ManifestAuth, type ManifestRepository } from "./manifest.ts";
import { renderMarkdown, stripFrontmatter, type AssetResolver } from "./markdown.ts";
import { assetOutputPath, hash8, looksLikeAsset, MAX_ASSET_BYTES } from "./assets.ts";
import { readHistory } from "./history.ts";
import { withBase } from "./base.ts";

export interface RenderedFile {
    /** Output path relative to the site root, e.g. `index.html`, `spec-format/index.html`. */
    path: string;
    /** Text for a page, raw bytes for an asset. */
    contents: string | Uint8Array;
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
    /** Where edits are proposed. Without it the site is read-only and no edit link is shown. */
    repository?: ManifestRepository;
    /** How readers sign in. Without it the editor falls back to a pasted token. */
    auth?: ManifestAuth;
    /** The bundled editor, built by the caller. Omitted for a read-only build. */
    editorBundle?: string;
    /** The bundled setup page. Emitted only when `site.setup` is on and sign-in is configured. */
    setupBundle?: string;
    /** I-5: a reference to a missing or oversized asset is said out loud, not swallowed. */
    onWarning?: (message: string) => void;
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

    const editable = Boolean(options.repository && options.editorBundle);

    // One pass over the repository's history for every document at once. F-7: the dates
    // a page shows are the repository's, and there is nowhere else they could come from.
    const history = await readHistory(root, (message) => (options.onWarning ?? (() => {}))(message));

    // I-1: an asset is here because a document points at it. Nothing is globbed, so a
    // file nobody links to is never copied and an images directory cannot trip D-6.
    const assets = new Map<string, { outputPath: string; bytes: Uint8Array }>();
    const warn = options.onWarning ?? (() => {});

    const assetsFor =
        (fromPath: string): AssetResolver =>
        async (repoPath) => {
            if (!looksLikeAsset(repoPath)) return undefined;
            const already = assets.get(repoPath);
            // I-6: two documents pointing at one file emit it once.
            if (already) return withBase(base, `/${already.outputPath}`);

            let bytes: Uint8Array;
            try {
                bytes = new Uint8Array(await readFile(join(root, repoPath)));
            } catch {
                warn(`${fromPath} points at ${repoPath}, which is not in the repository`);
                return undefined;
            }
            if (bytes.length > MAX_ASSET_BYTES) {
                warn(
                    `${fromPath} points at ${repoPath}, which is ${Math.round(bytes.length / 1024)} kB — ` +
                        `over the ${MAX_ASSET_BYTES / 1024} kB limit, so it is left as written`,
                );
                return undefined;
            }
            const outputPath = assetOutputPath(repoPath, await hash8(bytes));
            assets.set(repoPath, { outputPath, bytes });
            return withBase(base, `/${outputPath}`);
        };

    const files: RenderedFile[] = [];
    for (const space of discovery.spaces) {
        for (const document of space.documents) {
            const source = await readFile(join(root, document.path), "utf8");
            const content = await renderMarkdown(
                document,
                stripFrontmatter(source),
                lookup,
                base,
                assetsFor(document.path),
            );
            files.push({
                path: outputPathFor(document.address),
                contents: renderPage({
                    siteTitle: config.site.title || space.title,
                    space,
                    document,
                    nav: buildNav(space, document, base),
                    base,
                    content,
                    editHref: editable
                        ? `${base}/_edit/?doc=${encodeURIComponent(document.id)}`
                        : undefined,
                    history: history.get(document.path),
                }),
            });
        }
    }

    for (const [, asset] of assets) {
        files.push({ path: asset.outputPath, contents: asset.bytes });
    }

    if (options.repository) {
        files.push({
            path: "_gitspec/manifest.json",
            contents: JSON.stringify(
                buildManifest({
                    discovery,
                    base,
                    repository: options.repository,
                    auth: options.auth,
                    // So the editor's preview can show an image that is already committed,
                    // without knowing how the build addressed it.
                    assets: Object.fromEntries(
                        [...assets].map(([repoPath, a]) => [repoPath, withBase(base, `/${a.outputPath}`)]),
                    ),
                }),
                null,
                2,
            ),
        });
    }

    if (editable) {
        files.push({ path: "_gitspec/editor.js", contents: options.editorBundle! });
        files.push({
            path: "_edit/index.html",
            contents: editorPage({
                siteTitle: config.site.title,
                bundlePath: `${base}/_gitspec/editor.js`,
            }),
        });
    }

    // O-4: the setup page is served from the site that opts in — GitSpec's own — and
    // acts only with the signed-in person's token. It needs sign-in configured, and it
    // needs no documents at all: it is about repositories that have no site yet.
    if (config.site.setup && options.auth && options.setupBundle) {
        files.push({ path: "_gitspec/setup.js", contents: options.setupBundle });
        files.push({
            path: "_setup/index.html",
            contents: appPage({
                title: `Set up · ${config.site.title}`,
                bundlePath: `${base}/_gitspec/setup.js`,
            }),
        });
    }

    return files;
}
