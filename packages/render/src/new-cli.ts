#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
    checkDocument,
    directoryFor,
    discover,
    DiscoveryError,
    newDocument,
    parseConfig,
    summaryPathFor,
    withSummaryEntry,
} from "@gitspec/core";

/**
 * `gitspec new` — a document that starts out passing.
 *
 * The product had no beginning: everything operated on documents that already existed,
 * and creating one meant writing seven frontmatter keys from memory, getting three
 * headings right, and remembering a navigation line that nothing would have told you
 * about. This writes both files and then checks what it wrote, so a failure is this
 * command's bug rather than the author's problem.
 */

function flag(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);

/** The first argument that is not a flag or a flag's value. */
function titleFrom(argv: string[]): string {
    const words: string[] = [];
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i]!;
        if (arg.startsWith("--")) {
            if (!["json", "dry-run"].includes(arg.slice(2))) i += 1;
            continue;
        }
        words.push(arg);
    }
    return words.join(" ").trim();
}

const root = resolve(flag("root", "."));
const configPath = resolve(root, flag("config", "gitspec.yaml"));
const title = titleFrom(process.argv);

function fail(message: string): never {
    if (has("json")) console.log(JSON.stringify({ error: message }, null, 2));
    else console.error(message);
    process.exit(2);
}

if (!title) {
    fail('a title is required: gitspec new "Caching strategy" [--kind page] [--id some-id] [--owner @who]');
}

try {
    const config = parseConfig(await readFile(configPath, "utf8"));
    const discovery = await discover(root, config);

    const spaceKey = flag("space", "");
    const space = spaceKey
        ? discovery.spaces.find((s) => s.key === spaceKey)
        : discovery.spaces[0];
    if (!space) fail(spaceKey ? `no space named \`${spaceKey}\`` : "this site has no spaces");

    const configured = config.spaces.find((s) => s.key === space.key)!;
    const kind = flag("kind", "spec") === "page" ? "page" : "spec";

    const existing = discovery.spaces.flatMap((s) => s.documents.map((d) => ({ path: d.path, kind: d.kind })));
    const document = newDocument({
        title,
        kind,
        id: flag("id", ""),
        owner: flag("owner", ""),
        directory: directoryFor(kind, configured.directory ?? space.path, existing),
    });

    const clash = existing.find((d) => d.path === document.path);
    if (clash) fail(`\`${document.path}\` already exists`);
    const sameId = discovery.spaces.flatMap((s) => s.documents).find((d) => d.id === document.id);
    if (sameId) fail(`the id \`${document.id}\` is already declared by \`${sameId.path}\` (A-2)`);

    // What it wrote has to pass what it will be checked by, or this command is the thing
    // producing work for a reviewer.
    const findings = checkDocument(document.path, document.contents, kind);
    if (findings.length > 0) {
        fail(`generated a document that does not pass the checker: ${findings.map((f) => f.message).join("; ")}`);
    }

    // N-4: the navigation entry travels with the document it points at, never on its own.
    const summaryPath = summaryPathFor(configured);
    let summary: { path: string; contents: string } | undefined;
    if (summaryPath) {
        const current = await readFile(join(root, summaryPath), "utf8").catch(() => undefined);
        const next = current === undefined ? undefined : withSummaryEntry(summaryPath, current, document);
        if (next) summary = { path: summaryPath, contents: next };
    }

    if (!has("dry-run")) {
        await mkdir(dirname(join(root, document.path)), { recursive: true });
        await writeFile(join(root, document.path), document.contents);
        if (summary) await writeFile(join(root, summary.path), summary.contents);
    }

    if (has("json")) {
        console.log(
            JSON.stringify(
                { path: document.path, id: document.id, title: document.title, summary: summary?.path ?? null },
                null,
                2,
            ),
        );
    } else {
        const verb = has("dry-run") ? "would write" : "wrote";
        console.log(`${verb} ${document.path}`);
        if (summary) console.log(`${verb} ${summary.path}  (navigation entry)`);
        else if (summaryPath) console.log(`note: ${summaryPath} already lists it, or could not be read`);
        console.log(`\nid: ${document.id} — permanent, and independent of where the file sits.`);
    }
} catch (error) {
    fail(error instanceof DiscoveryError ? error.message : String(error));
}
