import type { SpaceConfig } from "./config.ts";

/** `/`, `/docs`, `/docs/guide` — always leading slash, never trailing. */
export function normalizeSpacePath(path: string): string {
    const trimmed = `/${path}`.replace(/\/+/g, "/").replace(/\/$/, "");
    return trimmed === "" ? "/" : trimmed;
}

/**
 * A-5: a `directory` space implies `README.md` inside it. A space defined by globs spans
 * unrelated trees, so there is no location to imply and none is guessed — the same
 * reasoning as N-5 for the navigation file.
 */
export function defaultHomeFor(space: SpaceConfig): string | undefined {
    if (space.home) return space.home.replace(/^\.\//, "");
    if (space.directory) {
        const dir = space.directory.replace(/^\.\//, "").replace(/\/$/, "");
        return dir ? `${dir}/README.md` : "README.md";
    }
    return undefined;
}

/**
 * A-1 addresses a document by its id; A-6 carves out the home document, which answers at
 * the space's own path instead. The home document is deliberately not served twice.
 */
export function addressFor(spacePath: string, id: string, isHome: boolean): string {
    const base = normalizeSpacePath(spacePath);
    if (isHome) return base;
    return base === "/" ? `/${id}` : `${base}/${id}`;
}
