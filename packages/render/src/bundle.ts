import { join } from "node:path";

/**
 * Bundle the editor for the browser.
 *
 * Built from source at render time rather than committed as an artefact: the editor
 * imports the same `@gitspec/github` the tests cover, so a change to the submission
 * rules cannot reach the site without going through them.
 */
export async function buildEditorBundle(): Promise<string> {
    const entry = join(import.meta.dir, "../../../apps/web/src/editor.ts");
    const result = await Bun.build({
        entrypoints: [entry],
        target: "browser",
        format: "esm",
        minify: true,
    });

    if (!result.success) {
        throw new Error(`editor bundle failed:\n${result.logs.map(String).join("\n")}`);
    }
    const output = result.outputs[0];
    if (!output) throw new Error("editor bundle produced no output");
    return output.text();
}
