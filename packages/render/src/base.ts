/**
 * Where the whole site is mounted, which is a property of the deployment rather than of
 * the content. GitHub Pages serves a project site under `/<repo>/`, a user site under
 * `/`, and a custom domain under `/` again — the same documents, the same addresses,
 * three different prefixes.
 *
 * So addresses stay site-relative everywhere else (A-1, A-6) and the prefix is applied
 * once, here, when an href is written. Nothing upstream has to know where the site ends
 * up, and output paths are unaffected because the artifact is mounted at the base.
 */
export function normalizeBase(base: string | undefined): string {
    if (!base) return "";
    const trimmed = `/${base}`.replace(/\/+/g, "/").replace(/\/$/, "");
    return trimmed === "/" ? "" : trimmed;
}

export function withBase(base: string, address: string): string {
    if (!base) return address;
    return address === "/" ? `${base}/` : `${base}${address}`;
}
