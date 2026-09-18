import { posix } from "node:path";
import { hash8, looksLikeAsset, MAX_ASSET_BYTES } from "@gitspec/render";

/**
 * Pasting a file into a document.
 *
 * The path an asset lands on carries a hash of its own bytes, which buys two things at
 * once: the same screenshot pasted twice is one file rather than two (I-6), and an image
 * that changed cannot be served from a cache holding the old one (I-2).
 *
 * It lives beside the document, under `images/`, rather than in a directory at the root
 * of the repository. A spec and its illustrations move together that way, and a relative
 * reference keeps working when the file is read on GitHub rather than through the site.
 */

export interface PendingAsset {
    /** Repository-root-relative, where the file will be committed. */
    repoPath: string;
    /** As written in the document, relative to it. */
    reference: string;
    bytes: Uint8Array;
}

/** Undefined when the file is acceptable; otherwise why it is not. */
export function checkAsset(name: string, size: number): string | undefined {
    if (!looksLikeAsset(name)) {
        return `${name} is not a kind of file GitSpec publishes`;
    }
    if (size > MAX_ASSET_BYTES) {
        // I-4. The limit is GitHub's Contents API read ceiling, not a preference: past it
        // the API returns no content, so this is the largest file that can be read back.
        return `${name} is ${Math.round(size / 1024)} kB, over the ${MAX_ASSET_BYTES / 1024} kB limit`;
    }
    return undefined;
}

export function assetPathFor(documentPath: string, name: string, hash: string): PendingAsset["repoPath"] {
    return posix.join(posix.dirname(documentPath), "images", assetNameFor(name, hash));
}

export function assetNameFor(name: string, hash: string): string {
    const base = posix.basename(name);
    const dot = base.lastIndexOf(".");
    const stem = (dot > 0 ? base.slice(0, dot) : base).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `${stem || "image"}-${hash}${dot > 0 ? base.slice(dot).toLowerCase() : ""}`;
}

export async function prepareAsset(documentPath: string, name: string, bytes: Uint8Array): Promise<PendingAsset> {
    const hash = await hash8(bytes);
    return {
        repoPath: assetPathFor(documentPath, name, hash),
        reference: `./images/${assetNameFor(name, hash)}`,
        bytes,
    };
}

/** What gets typed into the document. An image shows; anything else is a link to it. */
export function markdownFor(asset: PendingAsset, name: string): string {
    const isImage = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(asset.reference);
    const alt = posix.basename(name).replace(/\.[^.]+$/, "");
    return isImage ? `![${alt}](${asset.reference})` : `[${alt}](${asset.reference})`;
}

/** Only what the document still points at. A paste the author then deleted is not committed. */
export function referenced(assets: PendingAsset[], body: string): PendingAsset[] {
    return assets.filter((asset) => body.includes(asset.reference));
}
