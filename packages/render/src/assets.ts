import { posix } from "node:path";

/**
 * Images and other files a document points at.
 *
 * Discovery is by reference, never by glob: an asset is copied because a document links
 * to it. That needs no configuration, cannot copy a file nobody uses, and keeps D-6 —
 * which refuses a space that matches nothing — from firing on an images directory.
 *
 * Built URLs are content-addressed. The same bytes always land at the same path, so a
 * document referring to an image from two places produces one file, and an image that
 * changed can never be served from a cache holding the old one.
 */

/**
 * What may become an asset.
 *
 * An allow-list rather than "any file that exists", because a document linking to
 * `../src/schema.ts` — which the specs in this repository do constantly — would
 * otherwise copy source code into the published site. A reference to anything outside
 * this list is left exactly as the author wrote it.
 */
const ASSET_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico", ".bmp",
    ".pdf", ".mp4", ".webm", ".mp3", ".wav", ".zip", ".csv",
]);

export function looksLikeAsset(repoPath: string): boolean {
    const name = posix.basename(repoPath).toLowerCase();
    const dot = name.lastIndexOf(".");
    return dot > 0 && ASSET_EXTENSIONS.has(name.slice(dot));
}

/** Eight hex characters of SHA-256: enough that a collision is not a practical concern here. */
export async function hash8(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
    return [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Where an asset is served from.
 *
 * One flat directory rather than a tree mirroring the repository: the hash already makes
 * the name unique, and a shared directory means two documents referring to the same file
 * emit it once.
 */
export function assetOutputPath(repoPath: string, hash: string): string {
    const name = posix.basename(repoPath);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    return `_assets/${slug(stem)}-${hash}${extension}`;
}

function slug(stem: string): string {
    return stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

/**
 * The largest asset GitSpec will handle, matching GitHub's Contents API read ceiling.
 *
 * Not an arbitrary limit: past it the API answers `encoding: "none"` with no content, so
 * a larger file would be one this code could write and then never read back (R-6).
 */
export const MAX_ASSET_BYTES = 1024 * 1024;
