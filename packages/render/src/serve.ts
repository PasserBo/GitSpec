#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { discover, DiscoveryError, parseConfig } from "@gitspec/core";
import { buildEditorBundle, buildSetupBundle } from "./bundle.ts";
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

/** Repository details, from `gitspec.yaml` unless the caller overrides them. */
function repositoryFrom(config: { repository?: { owner: string; name: string; branch: string } }) {
    const flagged = flag("repository", "");
    const branch = flag("branch", "");
    if (flagged) {
        const [owner, name] = flagged.split("/");
        if (!owner || !name) throw new Error(`--repository expects owner/name, got \`${flagged}\``);
        return { owner, name, branch: branch || config.repository?.branch || "main" };
    }
    if (!config.repository) return undefined;
    return branch ? { ...config.repository, branch } : config.repository;
}

const root = resolve(flag("root", "."));
const configPath = resolve(root, flag("config", "gitspec.yaml"));
const port = Number(flag("port", "4321"));

async function build(): Promise<Map<string, string | Uint8Array>> {
    const config = parseConfig(await readFile(configPath, "utf8"));
    const discovery = await discover(root, config);
    const repository = repositoryFrom(config);
    const files = await renderSite(root, config, discovery, {
        base: flag("base", ""),
        repository,
        auth: config.auth,
        editorBundle: repository ? await buildEditorBundle() : undefined,
        setupBundle: config.site.setup && config.auth ? await buildSetupBundle() : undefined,
    });
    return new Map(files.map((file) => [`/${file.path}`, file.contents]));
}

function problemPage(message: string): string {
    return `<!doctype html><meta charset="utf-8"><title>GitSpec</title>
<body style="font:15px/1.6 ui-monospace,monospace;padding:40px;max-width:70ch">
<h1 style="font-size:17px">Discovery failed</h1>
<pre style="white-space:pre-wrap;color:#b00">${message.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</pre>
<p style="color:#666">Fix the configuration and reload.</p>`;
}

const ASSET_TYPES: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    svg: "image/svg+xml", webp: "image/webp", avif: "image/avif", ico: "image/x-icon",
    bmp: "image/bmp", pdf: "application/pdf", mp4: "video/mp4", webm: "video/webm",
    mp3: "audio/mpeg", wav: "audio/wav", zip: "application/zip", csv: "text/csv",
};

function contentTypeFor(key: string): string {
    return ASSET_TYPES[key.slice(key.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
}

Bun.serve({
    port,
    async fetch(request) {
        let files: Map<string, string | Uint8Array>;
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

        // Directory-style addresses resolve to their index; everything else — the
        // manifest and the editor bundle — is served at its own path.
        const key = files.has(path) ? path : `${path || ""}/index.html`;
        const body = files.get(key);
        if (body === undefined) return new Response("Not found", { status: 404 });

        // An asset is bytes and has its own type; everything the renderer emits as text
        // is one of three.
        if (typeof body !== "string") {
            return new Response(body, {
                headers: { "content-type": contentTypeFor(key) },
            });
        }
        const type = key.endsWith(".js")
            ? "text/javascript"
            : key.endsWith(".json")
              ? "application/json"
              : "text/html";
        return new Response(body, { headers: { "content-type": `${type}; charset=utf-8` } });
    },
});

console.log(`GitSpec preview on http://localhost:${port}`);
