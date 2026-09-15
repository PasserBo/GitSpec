#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { discover, DiscoveryError, parseConfig } from "@gitspec/core";
import { renderSite } from "./site.ts";

/**
 * Local preview. Renders on every request rather than caching, so an edit shows up on
 * reload — the site is small enough that a rebuild is cheaper than tracking what changed.
 *
 * Read-only, per R-3: it never writes to the repository, and a preview never becomes the
 * published state.
 */
function flag(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const root = resolve(flag("root", "."));
const configPath = resolve(root, flag("config", "gitspec.yaml"));
const port = Number(flag("port", "4321"));

async function build(): Promise<Map<string, string>> {
    const config = parseConfig(await readFile(configPath, "utf8"));
    const discovery = await discover(root, config);
    const files = await renderSite(root, config, discovery);
    return new Map(files.map((file) => [`/${file.path}`, file.contents]));
}

function problemPage(message: string): string {
    return `<!doctype html><meta charset="utf-8"><title>GitSpec</title>
<body style="font:15px/1.6 ui-monospace,monospace;padding:40px;max-width:70ch">
<h1 style="font-size:17px">Discovery failed</h1>
<pre style="white-space:pre-wrap;color:#b00">${message.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</pre>
<p style="color:#666">Fix the configuration and reload.</p>`;
}

Bun.serve({
    port,
    async fetch(request) {
        let files: Map<string, string>;
        try {
            files = await build();
        } catch (error) {
            const message = error instanceof DiscoveryError ? error.message : String(error);
            return new Response(problemPage(message), {
                status: 500,
                headers: { "content-type": "text/html; charset=utf-8" },
            });
        }

        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, "");
        const body = files.get(`${path}/index.html`) ?? files.get(`${path || "/"}/index.html`);

        if (!body) {
            return new Response("Not found", { status: 404 });
        }
        return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
});

console.log(`GitSpec preview on http://localhost:${port}`);
