import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { CONFIG_FILENAME } from "../config.ts";
import { createHarness, type Harness, makeTempDir } from "./helpers.ts";

function writeSnippet(dir: string, file: string, name: string, body: string, placement = "append"): void {
	writeFileSync(
		join(dir, file),
		`---\nname: ${name}\ndescription: ${name} description\nplacement: ${placement}\norder: 10\n---\n${body}\n`,
	);
}

function writeConfig(h: Harness, config: unknown): void {
	writeFileSync(join(h.agentDir, CONFIG_FILENAME), typeof config === "string" ? config : JSON.stringify(config));
}

async function runSnippetsCommand(h: Harness): Promise<void> {
	const command = h.commands.get("snippets");
	assert.ok(command);
	await command.handler("", h.ctx);
}

function lastError(h: Harness): string {
	const error = h.notifications.filter((n) => n.level === "error").at(-1);
	assert.ok(error, "an error notification was shown");
	return error.message;
}

describe("external snippets directory", () => {
	it("reads the config from the host agent directory (PI_CODING_AGENT_DIR)", async () => {
		const h = createHarness();
		await h.sessionStart();
		assert.equal(getAgentDir(), h.agentDir);
	});

	it("replaces the bundled snippets with the configured directory", async () => {
		const h = createHarness();
		const dir = makeTempDir();
		writeSnippet(dir, "mine.md", "Mine", "My own rule.");
		writeConfig(h, { snippetsDir: dir });
		await h.sessionStart();

		const menu = await h.openMenu(["space", "enter"]);
		const frame = menu.frames[0]?.join("\n") ?? "";
		assert.match(frame, /Mine/);
		assert.doesNotMatch(frame, /Session kickoff/, "bundled snippets are not merged in");

		assert.deepEqual(await h.send("hello"), { action: "transform", text: "hello\n\nMy own rule." });
		assert.equal(h.notifications.length, 0);
	});

	it("resolves a relative snippetsDir against the config file's directory", async () => {
		const h = createHarness();
		const dir = join(h.agentDir, "my-snippets");
		mkdirSync(dir);
		writeSnippet(dir, "rel.md", "Relative", "Relative rule.", "prepend");
		writeConfig(h, { snippetsDir: "my-snippets" });
		await h.sessionStart();

		await h.openMenu(["space", "enter"]);
		assert.deepEqual(await h.send("hi"), { action: "transform", text: "Relative rule.\n\nhi" });
	});

	it("keeps re-scanning snippet files live within a session", async () => {
		const h = createHarness();
		const dir = makeTempDir();
		writeSnippet(dir, "a.md", "Alpha", "Alpha rule.");
		writeConfig(h, { snippetsDir: dir });
		await h.sessionStart();

		writeSnippet(dir, "b.md", "Beta", "Beta rule.");
		const menu = await h.openMenu(["escape"]);
		assert.match(menu.frames[0]?.join("\n") ?? "", /Beta/);
	});

	it("applies config changes only at the next session start", async () => {
		const h = createHarness();
		const first = makeTempDir();
		const second = makeTempDir();
		writeSnippet(first, "first.md", "First", "First rule.");
		writeSnippet(second, "second.md", "Second", "Second rule.");
		writeConfig(h, { snippetsDir: first });
		await h.sessionStart();

		writeConfig(h, { snippetsDir: second });
		const before = await h.openMenu(["escape"]);
		assert.match(before.frames[0]?.join("\n") ?? "", /First/);

		await h.sessionStart();
		const after = await h.openMenu(["escape"]);
		assert.match(after.frames[0]?.join("\n") ?? "", /Second/);
	});

	it("reports invalid config JSON instead of falling back to bundled snippets", async () => {
		const h = createHarness();
		writeConfig(h, "{ not json");
		await h.sessionStart();
		assert.match(lastError(h), /Invalid prompt-snippets config .*not valid JSON/);

		await runSnippetsCommand(h);
		assert.equal(h.menus.length, 0, "menu does not open with bundled snippets");
		assert.match(lastError(h), /not valid JSON/);
		assert.equal(await h.send("hello"), undefined);
	});

	it("reports an invalid snippetsDir type", async () => {
		const h = createHarness();
		writeConfig(h, { snippetsDir: 7 });
		await h.sessionStart();
		assert.match(lastError(h), /"snippetsDir" must be a non-empty string/);
	});

	it("reports a missing configured directory and does not create it", async () => {
		const h = createHarness();
		const dir = join(makeTempDir(), "missing");
		writeConfig(h, { snippetsDir: dir });
		await h.sessionStart();

		assert.equal(lastError(h), `Snippets directory ${dir} (configured in ${join(h.agentDir, CONFIG_FILENAME)}) does not exist`);
		await runSnippetsCommand(h);
		assert.equal(h.menus.length, 0);
		assert.equal(existsSync(dir), false, "configured directory is not created");
	});

	it("reports when the configured directory disappears before sending", async () => {
		const h = createHarness();
		const dir = makeTempDir();
		writeSnippet(dir, "gone.md", "Gone", "Gone rule.");
		writeConfig(h, { snippetsDir: dir });
		await h.sessionStart();
		await h.openMenu(["space", "enter"]);

		rmSync(dir, { recursive: true, force: true });
		assert.equal(await h.send("hello"), undefined);
		assert.match(lastError(h), /does not exist; message sent without snippets$/);
		assert.equal(await h.send("again"), undefined, "toggles still reset after send");
	});
});
