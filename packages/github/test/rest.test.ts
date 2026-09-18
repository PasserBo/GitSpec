import { describe, expect, test } from "bun:test";
import { restRepo } from "../src/rest.ts";
import { SubmitError } from "../src/errors.ts";

/** A fetch that answers one canned response and records what it was asked. */
function stub(response: Response) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return response;
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
}

function repoWith(response: Response) {
    const { fetch, calls } = stub(response);
    return { repo: restRepo({ owner: "o", repo: "r", token: "t", fetch }), calls };
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
}

describe("R-6: a file that cannot be read faithfully is refused", () => {
    test("GitHub's over-1MB answer throws instead of reading as empty", async () => {
        const { repo } = repoWith(json({ sha: "s", content: "", encoding: "none" }));
        const failure = await repo.getFile("big.md", "main").catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(SubmitError);
        expect((failure as SubmitError).rule).toBe("R-6");
        // The message has to send the author somewhere, not just say no.
        expect((failure as SubmitError).message).toContain("over 1 MB");
    });

    test("a genuinely empty file still reads as empty", async () => {
        const { repo } = repoWith(json({ sha: "s", content: "", encoding: "base64" }));
        expect(await repo.getFile("empty.md", "main")).toEqual({ sha: "s", text: "" });
    });

    test("a missing file is still undefined, not an error", async () => {
        const { repo } = repoWith(json({ message: "Not Found" }, 404));
        expect(await repo.getFile("gone.md", "main")).toBeUndefined();
    });

    test("content is decoded as UTF-8, not as bytes", async () => {
        const text = "# 仕様\n\nドリフト検出。\n";
        const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
        const { repo } = repoWith(json({ sha: "s", content: encoded, encoding: "base64" }));
        expect((await repo.getFile("doc.md", "main"))?.text).toBe(text);
    });
});

describe("putFile encodes what it was given", () => {
    function sentContent(calls: { init?: RequestInit }[]): string {
        return JSON.parse(String(calls.at(-1)!.init!.body)).content;
    }

    test("text survives the round trip", async () => {
        const { repo, calls } = repoWith(json({ content: {} }));
        await repo.putFile({ path: "a.md", branch: "b", message: "m", contents: "héllo\n" });
        expect(new TextDecoder().decode(Uint8Array.from(atob(sentContent(calls)), (c) => c.charCodeAt(0)))).toBe(
            "héllo\n",
        );
    });

    test("a binary at the asset ceiling encodes correctly", async () => {
        // The point of chunking. Spreading every byte as an argument to
        // String.fromCharCode throws somewhere around 65-125 kB in a browser, which is
        // why no document ever reached it and the first pasted screenshot would have.
        // Bun's own limit is far higher, so this size is chosen to fail there too: it is
        // 1 MB, which is both past Bun's threshold and the largest asset I-4 will accept.
        const bytes = new Uint8Array(1_000_000);
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256;

        const { repo, calls } = repoWith(json({ content: {} }));
        await repo.putFile({ path: "shot.png", branch: "b", message: "m", contents: bytes });

        const back = Uint8Array.from(atob(sentContent(calls)), (c) => c.charCodeAt(0));
        expect(back.length).toBe(bytes.length);
        expect(back).toEqual(bytes);
    });

    test("a byte sequence that is not valid UTF-8 is preserved exactly", async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
        const { repo, calls } = repoWith(json({ content: {} }));
        await repo.putFile({ path: "x.png", branch: "b", message: "m", contents: bytes });
        expect(Uint8Array.from(atob(sentContent(calls)), (c) => c.charCodeAt(0))).toEqual(bytes);
    });
});
