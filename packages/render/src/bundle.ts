import { join } from "node:path";

/**
 * Bundle a browser entry point from `apps/web`.
 *
 * Built from source at render time rather than committed as an artefact: both pages
 * import the same `@gitspec/github` the tests cover, so a change to the submission rules
 * cannot reach a site without going through them.
 */
export async function buildBundle(entryRelativeToRepo: string): Promise<string> {
    const entry = join(import.meta.dir, "../../..", entryRelativeToRepo);
    const result = await Bun.build({
        entrypoints: [entry],
        target: "browser",
        format: "esm",
        minify: true,
    });

    if (!result.success) {
        throw new Error(`bundle of ${entryRelativeToRepo} failed:\n${result.logs.map(String).join("\n")}`);
    }
    const output = result.outputs[0];
    if (!output) throw new Error(`bundle of ${entryRelativeToRepo} produced no output`);
    return output.text();
}

export const buildEditorBundle = (): Promise<string> => buildBundle("apps/web/src/editor.ts");
export const buildSetupBundle = (): Promise<string> => buildBundle("apps/web/src/setup.ts");
