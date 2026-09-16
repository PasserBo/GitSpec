import { parse as parseYaml } from "yaml";
import { DiscoveryError } from "./errors.ts";

export interface SpaceConfig {
    key: string;
    title: string;
    path: string;
    /** Shorthand for `include: ["<directory>/**\/*.md"]`. Mutually exclusive with `include` (D-2). */
    directory?: string;
    include?: string[];
    exclude?: string[];
    /** Navigation file for a glob-defined space, which has no implied location (N-5). */
    summary?: string;
    /** The document answering at the space's own `path` (A-5). Defaults to `<directory>/README.md`. */
    home?: string;
}

export interface RepositoryConfig {
    owner: string;
    name: string;
    /** Branch edits are proposed against. Defaults to `main`. */
    branch: string;
}

export interface AuthConfig {
    /** GitHub App client id. Public by design; the secret lives only in the broker. */
    clientId: string;
    /** Base URL of the token broker. */
    broker: string;
}

export interface Config {
    version: number;
    site: { title: string };
    spaces: SpaceConfig[];
    /** Where edits go. Absent means the site is read-only. */
    repository?: RepositoryConfig;
    /** How readers sign in. Absent leaves the editor without a way to obtain a token. */
    auth?: AuthConfig;
}

/** Directory names never discovered, whatever a space's globs say (D-3). */
export const BUILT_IN_EXCLUDE_DIRS = [
    "node_modules",
    ".git",
    "vendor",
    "dist",
    "build",
    ".next",
    "target",
    ".venv",
    "__pycache__",
];

function required(value: unknown, field: string, where: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new DiscoveryError("D-2", `${where} is missing a \`${field}\``);
    }
    return value;
}

export function parseConfig(source: string): Config {
    const raw = parseYaml(source) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") {
        throw new DiscoveryError("D-2", "gitspec.yaml is empty or is not a mapping");
    }

    const spacesRaw = raw.spaces;
    if (!Array.isArray(spacesRaw) || spacesRaw.length === 0) {
        throw new DiscoveryError("D-2", "gitspec.yaml declares no spaces");
    }

    const spaces: SpaceConfig[] = spacesRaw.map((entry, i) => {
        const s = entry as Record<string, unknown>;
        const key = required(s.key, "key", `space #${i + 1}`);

        // D-2: the shorthand and the general form are alternatives, never both. Accepting
        // both would mean silently picking one, and the site would be built from content
        // the author did not intend.
        if (s.directory !== undefined && s.include !== undefined) {
            throw new DiscoveryError(
                "D-2",
                `space \`${key}\` declares both \`directory\` and \`include\`; a space declares one or the other`,
            );
        }
        if (s.directory === undefined && s.include === undefined) {
            throw new DiscoveryError("D-2", `space \`${key}\` declares neither \`directory\` nor \`include\``);
        }

        return {
            key,
            title: required(s.title, "title", `space \`${key}\``),
            path: required(s.path, "path", `space \`${key}\``),
            directory: s.directory as string | undefined,
            include: s.include as string[] | undefined,
            exclude: (s.exclude as string[] | undefined) ?? [],
            summary: s.summary as string | undefined,
            home: s.home as string | undefined,
        };
    });

    const seen = new Set<string>();
    for (const space of spaces) {
        if (seen.has(space.key)) {
            throw new DiscoveryError("D-2", `space key \`${space.key}\` is declared twice`);
        }
        seen.add(space.key);
    }

    const repoRaw = raw.repository as Record<string, unknown> | undefined;
    const repository = repoRaw
        ? {
              owner: required(repoRaw.owner, "owner", "`repository`"),
              name: required(repoRaw.name, "name", "`repository`"),
              branch: typeof repoRaw.branch === "string" ? repoRaw.branch : "main",
          }
        : undefined;

    const authRaw = raw.auth as Record<string, unknown> | undefined;
    const auth = authRaw
        ? {
              clientId: required(authRaw.clientId, "clientId", "`auth`"),
              broker: required(authRaw.broker, "broker", "`auth`"),
          }
        : undefined;

    return {
        version: typeof raw.version === "number" ? raw.version : 1,
        site: { title: String((raw.site as Record<string, unknown>)?.title ?? "") },
        spaces,
        repository,
        auth,
    };
}

/** Normalise `./docs` and `docs/` alike, and expand the `directory` shorthand (D-2). */
export function includeGlobsFor(space: SpaceConfig): string[] {
    if (space.include) return space.include;
    const dir = space.directory!.replace(/^\.\//, "").replace(/\/$/, "");
    return [`${dir}/**/*.md`];
}
