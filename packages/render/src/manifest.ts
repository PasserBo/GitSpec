import type { Claim, DiscoveryResult } from "@gitspec/core";

export interface ManifestDocument {
    id: string;
    /** Repository-root-relative, which is what an edit writes to. */
    path: string;
    title: string;
    /** Site-relative; the deployment prefix is applied by whoever builds a link. */
    address: string;
    kind: "spec" | "page";
    spaceKey: string;
    /** F-3. Absent on a page, which has no status to have. */
    status?: string;
    /** F-4: the code this spec describes. */
    governs?: string[];
    /**
     * Every identified statement in the document, with the address it answers at.
     *
     * Here so that something reading this site does not have to parse Markdown to find
     * out what a document claims. Page-level addressing is what every documentation tool
     * offers; this format already paid for statement-level addressing by making authors
     * identify their claims, and publishing the index is what makes that paid-for
     * property usable by anything other than a human reading the page.
     */
    claims?: { id: string; text: string; address: string }[];
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
    /** Claims by repository path, read while the documents were. */
    claims?: Map<string, Claim[]>;
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
                ...(document.kind === "spec" && typeof document.frontmatter.status === "string"
                    ? { status: document.frontmatter.status }
                    : {}),
                ...(Array.isArray(document.frontmatter.governs)
                    ? { governs: document.frontmatter.governs.filter((g): g is string => typeof g === "string") }
                    : {}),
                ...(args.claims?.get(document.path)?.length
                    ? {
                          claims: args.claims.get(document.path)!.map((claim) => ({
                              id: claim.id,
                              text: claim.text,
                              address: `${document.address}#${claim.id}`,
                          })),
                      }
                    : {}),
            })),
        ),
    };
}
