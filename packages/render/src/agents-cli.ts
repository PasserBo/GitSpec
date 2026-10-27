#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { agentsMarkdown, DiscoveryError, parseConfig, summaryPathFor } from "@gitspec/core";

/** `gitspec agents` — write the instruction file, from the rules rather than from memory. */
function flag(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const root = resolve(flag("root", "."));
const configPath = resolve(root, flag("config", "gitspec.yaml"));
const out = resolve(root, flag("out", "AGENTS.md"));

try {
    const config = parseConfig(await readFile(configPath, "utf8"));
    const contents = agentsMarkdown({
        spaces: config.spaces.map((space) => ({
            key: space.key,
            title: space.title,
            directory: space.directory,
            summary: summaryPathFor(space),
        })),
        checkCommand: flag("check-command", "bun run check"),
        newCommand: flag("new-command", "bun run new"),
    });

    if (has("stdout")) {
        console.log(contents);
    } else {
        await writeFile(out, contents);
        console.log(`wrote ${flag("out", "AGENTS.md")}`);
    }
} catch (error) {
    console.error(error instanceof DiscoveryError ? error.message : String(error));
    process.exit(2);
}
