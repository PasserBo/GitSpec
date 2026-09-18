import type { DiscoveryResult } from "@gitspec/core";

export interface ManifestDocument {
    id: string;
    /** Repository-root-relative, which is what an edit writes to. */
    path: string;
    title: string;
    /** Site-relative; the deployment prefix is applied by whoever builds a link. */
    address: string;
    kind: "spec" | "page";
    spaceKey: string;
}

export interface ManifestRepository {
    owner: string;
    name: string;
    /** Branch edits are proposed against. */
    branch: string;
}

export interface ManifestAuth {
    clientId: string;
    broker: string;
    appSlug?: string;
}

export interface SiteManifest {
    base: string;
    /**
     * Repository path to the URL the built site serves it from. Present so the editor's
     * preview can show an image that is already committed without recomputing how the
     * build addressed it.
     */
    assets?: Record<string, string>;
    repository?: ManifestRepository;
    /** Both values are public: the client id identifies the app, the broker is a URL. */
    auth?: ManifestAuth;
    documents: ManifestDocument[];
}

/**
 * What the editor needs to know that it cannot work out from a rendered page: which file
 * backs a given address, and which repository to propose against.
 *
 * Published as a plain file alongside the site rather than held by a service, so the
 * editor stays a static page talking to GitHub directly (B-1). It carries no content —
 * the document text is read from the repository at edit time, which is what keeps the
 * repository the only authoritative store (A-1) even while an edit is in progress.
 */
export function buildManifest(args: {
    discovery: DiscoveryResult;
    base: string;
    repository?: ManifestRepository;
    auth?: ManifestAuth;
    assets?: Record<string, string>;
}): SiteManifest {
    return {
        base: args.base,
        assets: args.assets,
        repository: args.repository,
        auth: args.auth,
        documents: args.discovery.spaces.flatMap((space) =>
            space.documents.map((document) => ({
                id: document.id,
                path: document.path,
                title: String(document.frontmatter.title ?? document.id),
                address: document.address,
                kind: document.kind,
                spaceKey: space.key,
            })),
        ),
    };
}
