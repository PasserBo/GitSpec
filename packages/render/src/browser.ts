/**
 * What a browser may import from render.
 *
 * Most of this package is the build: `site.ts` reads files, `bundle.ts` calls
 * `Bun.build`, `history.ts` shells out to git. None of that belongs in a page, and none
 * of it is kept out by the bundler — a browser target stubs the Node modules and builds
 * anyway. See `browser.ts` in core for what that cost once.
 */

export { assetOutputPath, hash8, looksLikeAsset, MAX_ASSET_BYTES } from "./assets.ts";
export { normalizeBase, withBase } from "./base.ts";
export { renderMarkdown, stripFrontmatter } from "./markdown.ts";
export type { AddressLookup, AssetResolver } from "./markdown.ts";
export type {
    ManifestAuth,
    ManifestDocument,
    ManifestRepository,
    SiteManifest,
} from "./manifest.ts";
