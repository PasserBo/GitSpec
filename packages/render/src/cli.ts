#!/usr/bin/env bun
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { discover, DiscoveryError, parseConfig } from "@gitspec/core";
import { renderSite } from "./site.ts";

function flag(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const root = resolve(flag("root", "."));
const configPath = resolve(root, flag("config", "gitspec.yaml"));
const outDir = resolve(flag("out", "_site"));

try {
    const config = parseConfig(await readFile(configPath, "utf8"));
    const discovery = await discover(root, config);
    const files = await renderSite(root, config, discovery, { base: flag("base", "") });

    // Removed rather than merged: a stale page from a document that has since been
    // deleted would otherwise stay published, which is the failure this whole project
    // is about.
    await rm(outDir, { recursive: true, force: true });
    for (const file of files) {
        const target = join(outDir, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.contents, "utf8");
    }

    for (const space of discovery.spaces) {
        const specs = space.documents.filter((d) => d.kind === "spec").length;
        console.log(
            `${space.key}: ${space.documents.length} documents (${specs} specs) at ${space.path}, ` +
                `navigation ${space.navigation.source}`,
        );
    }
    console.log(`wrote ${files.length} files to ${outDir}`);
} catch (error) {
    // A discovery failure is a configuration mistake with a named cause, so it is printed
    // as the one line that matters rather than as a stack trace.
    if (error instanceof DiscoveryError) {
        console.error(error.message);
        process.exit(1);
    }
    throw error;
}
