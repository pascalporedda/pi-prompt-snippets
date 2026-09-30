import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CONFIG_FILENAME, checkSnippetSource, resolveSnippetSource, type SnippetSource } from "../config.ts";
import { makeTempDir } from "./helpers.ts";

const bundledDir = "/bundled/snippets";
const homeDir = "/home/tester";

function resolveWith(contents: string | undefined): { source: SnippetSource; configDir: string; configPath: string } {
	const configDir = makeTempDir();
	const configPath = join(configDir, CONFIG_FILENAME);
	if (contents !== undefined) writeFileSync(configPath, contents);
	return { source: resolveSnippetSource({ configPath, bundledDir, homeDir }), configDir, configPath };
}

function assertInvalid(source: SnippetSource, pattern: RegExp): void {
	assert.equal(source.kind, "invalid");
	if (source.kind !== "invalid") return;
	assert.match(source.error, /^Invalid prompt-snippets config /);
	assert.ok(source.error.includes(source.configPath), "error names the config file");
	assert.match(source.error, pattern);
}

describe("resolveSnippetSource", () => {
	it("uses the bundled snippets when the config file does not exist", () => {
		assert.deepEqual(resolveWith(undefined).source, { kind: "bundled", dir: bundledDir });
	});

	it("uses the bundled snippets when snippetsDir is not set", () => {
		assert.deepEqual(resolveWith("{}").source, { kind: "bundled", dir: bundledDir });
	});

	it("uses absolute paths as-is", () => {
		const { source, configPath } = resolveWith(JSON.stringify({ snippetsDir: "/abs/snippets" }));
		assert.deepEqual(source, { kind: "configured", dir: "/abs/snippets", configPath });
	});

	it("expands ~ and ~/ against the home directory", () => {
		const tilde = resolveWith(JSON.stringify({ snippetsDir: "~/my/snippets" })).source;
		assert.ok(tilde.kind === "configured" && tilde.dir === join(homeDir, "my/snippets"));
		const bare = resolveWith(JSON.stringify({ snippetsDir: "~" })).source;
		assert.ok(bare.kind === "configured" && bare.dir === homeDir);
	});

	it("resolves relative paths against the config file's directory", () => {
		const nested = resolveWith(JSON.stringify({ snippetsDir: "my-snippets" }));
		assert.ok(nested.source.kind === "configured" && nested.source.dir === join(nested.configDir, "my-snippets"));
		const parent = resolveWith(JSON.stringify({ snippetsDir: "../shared" }));
		assert.ok(parent.source.kind === "configured" && parent.source.dir === join(parent.configDir, "..", "shared"));
	});

	it("rejects invalid JSON", () => {
		assertInvalid(resolveWith("{ snippetsDir: nope").source, /not valid JSON/);
	});

	it("rejects JSON that is not an object", () => {
		for (const contents of ["[]", "null", '"~/snippets"', "42"]) {
			assertInvalid(resolveWith(contents).source, /expected a JSON object/);
		}
	});

	it("rejects unknown keys so typos do not silently fall back", () => {
		assertInvalid(resolveWith(JSON.stringify({ snippetDir: "~/snippets" })).source, /unknown key\(s\) snippetDir/);
	});

	it("rejects a snippetsDir that is not a non-empty string", () => {
		for (const snippetsDir of [42, null, true, "", "   ", ["~/a"]]) {
			assertInvalid(resolveWith(JSON.stringify({ snippetsDir })).source, /"snippetsDir" must be a non-empty string/);
		}
	});

	it("rejects a config path that cannot be read", () => {
		const configPath = makeTempDir(); // a directory, not a file
		assertInvalid(resolveSnippetSource({ configPath, bundledDir, homeDir }), /cannot read file/);
	});
});

describe("checkSnippetSource", () => {
	it("accepts the bundled directory", () => {
		assert.deepEqual(checkSnippetSource({ kind: "bundled", dir: bundledDir }), { ok: true, dir: bundledDir });
	});

	it("passes through config errors", () => {
		assert.deepEqual(checkSnippetSource({ kind: "invalid", configPath: "/c.json", error: "boom" }), {
			ok: false,
			error: "boom",
		});
	});

	it("accepts an existing configured directory", () => {
		const dir = makeTempDir();
		assert.deepEqual(checkSnippetSource({ kind: "configured", dir, configPath: "/c.json" }), { ok: true, dir });
	});

	it("rejects a configured directory that does not exist", () => {
		const dir = join(makeTempDir(), "missing");
		const checked = checkSnippetSource({ kind: "configured", dir, configPath: "/c.json" });
		assert.deepEqual(checked, {
			ok: false,
			error: `Snippets directory ${dir} (configured in /c.json) does not exist`,
		});
	});

	it("rejects a configured path that is a file", () => {
		const file = join(makeTempDir(), "not-a-dir.md");
		writeFileSync(file, "");
		const checked = checkSnippetSource({ kind: "configured", dir: file, configPath: "/c.json" });
		assert.deepEqual(checked, {
			ok: false,
			error: `Snippets directory ${file} (configured in /c.json) is not a directory`,
		});
	});

	it("rejects a configured path below a file", () => {
		const file = join(makeTempDir(), "file");
		writeFileSync(file, "");
		const checked = checkSnippetSource({ kind: "configured", dir: join(file, "child"), configPath: "/c.json" });
		assert.ok(!checked.ok && checked.error.endsWith("does not exist"));
	});
});
