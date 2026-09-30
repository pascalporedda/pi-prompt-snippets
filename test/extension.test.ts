import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createHarness } from "./helpers.ts";

const snippetsDir = join(import.meta.dirname, "..", "snippets");

function bodyOf(file: string): string {
	const raw = readFileSync(join(snippetsDir, file), "utf8");
	const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
	assert.ok(match?.[1], `${file} has frontmatter and a body`);
	return match[1].trim();
}

// Menu order: prepend group by order, then append group by order.
// 0 session-kickoff, 1 orchestrator-mode, 2 ask-questions, 3 verify-not-assume,
// 4 delegate-exploration, 5 diagnose-report, 6 break-it

describe("registration", () => {
	it("registers the /snippets command, alt+s shortcut, and lifecycle handlers", () => {
		const h = createHarness();
		assert.ok(h.commands.has("snippets"));
		assert.ok(h.shortcuts.has("alt+s"));
		assert.ok(h.handlers.has("session_start"));
		assert.ok(h.handlers.has("input"));
	});
});

describe("menu", () => {
	it("lists prepend snippets before append snippets, each sorted by order", async () => {
		const h = createHarness();
		await h.sessionStart();
		const menu = await h.openMenu(["escape"]);
		const frame = menu.frames[0]?.join("\n") ?? "";
		const names = [
			"PREPEND",
			"Session kickoff",
			"Orchestrator mode",
			"APPEND",
			"Ask questions",
			"Verify, don't assume",
			"Delegate exploration",
			"Diagnose, don't fix",
			"Break it",
		];
		let last = -1;
		for (const name of names) {
			const idx = frame.indexOf(name);
			assert.ok(idx > last, `${name} appears after the previous entry`);
			last = idx;
		}
	});

	it("previews the highlighted snippet with tab and returns with tab", async () => {
		const h = createHarness();
		await h.sessionStart();
		const menu = await h.openMenu(["down", "tab", "tab", "escape"]);
		const preview = menu.frames[2]?.join("\n") ?? "";
		assert.match(preview, /Preview: Orchestrator mode/);
		assert.match(preview, /prepend · order 30 · orchestrator-mode\.md/);
		assert.match(preview, /pure high-level orchestrator session/);
		const back = menu.frames[3]?.join("\n") ?? "";
		assert.match(back, /> \[ \] Orchestrator mode/);
	});

	it("scrolls long lists with more-indicators in short terminals", async () => {
		const h = createHarness({ rows: 12 });
		await h.sessionStart();
		const menu = await h.openMenu(["escape"]);
		const frame = menu.frames[0]?.join("\n") ?? "";
		assert.match(frame, /↓ \d+ more/);
	});

	it("does not apply toggles when cancelled with escape", async () => {
		const h = createHarness();
		await h.sessionStart();
		await h.openMenu(["space", "escape"]);
		assert.equal(await h.send("hello"), undefined);
		assert.equal(h.widgets.at(-1), undefined);
	});

	it("warns instead of opening outside the terminal UI", async () => {
		const h = createHarness({ mode: "rpc" });
		await h.sessionStart();
		const command = h.commands.get("snippets");
		assert.ok(command);
		await command.handler("", h.ctx);
		assert.equal(h.menus.length, 0);
		assert.deepEqual(h.notifications, [{ message: "Snippet menu requires interactive mode", level: "warning" }]);
	});

	it("opens through the alt+s shortcut", async () => {
		const h = createHarness();
		await h.sessionStart();
		h.queueMenu(["escape"]);
		const shortcut = h.shortcuts.get("alt+s");
		assert.ok(shortcut);
		await shortcut.handler(h.ctx);
		assert.equal(h.menus.length, 1);
	});
});

describe("input transform", () => {
	it("passes messages through unchanged when nothing is toggled", async () => {
		const h = createHarness();
		await h.sessionStart();
		assert.equal(await h.send("hello"), undefined);
	});

	it("wraps the message with toggled snippets in group order and resets afterwards", async () => {
		const h = createHarness();
		await h.sessionStart();
		// Up wraps to break-it (6); then down wraps to session-kickoff (0), orchestrator-mode (1), ask-questions (2).
		await h.openMenu(["up", "space", "down", "space", "down", "space", "down", "space", "enter"]);

		assert.deepEqual(h.widgets.at(-1), [
			"↑ prepend: Session kickoff · Orchestrator mode",
			"↓ append: Ask questions · Break it",
		]);

		const result = await h.send("hello");
		assert.deepEqual(result, {
			action: "transform",
			text: [
				bodyOf("session-kickoff.md"),
				bodyOf("orchestrator-mode.md"),
				"hello",
				bodyOf("ask-questions.md"),
				bodyOf("break-it.md"),
			].join("\n\n"),
		});

		assert.equal(h.widgets.at(-1), undefined, "widget cleared after send");
		assert.equal(await h.send("again"), undefined, "toggles reset after send");
	});

	it("resets toggles at session start", async () => {
		const h = createHarness();
		await h.sessionStart();
		await h.openMenu(["space", "enter"]);
		await h.sessionStart();
		assert.equal(await h.send("hello"), undefined);
	});
});
