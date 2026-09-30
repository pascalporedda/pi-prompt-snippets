import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const snippetsDir = join(import.meta.dirname, "..", "snippets");

const EXPECTED = [
	"ask-questions.md",
	"break-it.md",
	"delegate-exploration.md",
	"diagnose-report.md",
	"orchestrator-mode.md",
	"session-kickoff.md",
	"verify-not-assume.md",
];

const files = readdirSync(snippetsDir).filter((file) => file.toLowerCase().endsWith(".md"));

describe("bundled snippets", () => {
	it("ships the expected snippet files", () => {
		assert.deepEqual([...files].sort(), EXPECTED);
	});

	for (const file of files) {
		it(`${file} has complete, valid frontmatter and a body`, () => {
			const raw = readFileSync(join(snippetsDir, file), "utf8");
			const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
			assert.ok(match, "frontmatter block delimited by --- lines");

			const meta = new Map<string, string>();
			for (const line of (match[1] ?? "").split(/\r?\n/)) {
				const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
				assert.ok(kv?.[1] !== undefined && kv[2] !== undefined, `frontmatter line is "key: value": ${line}`);
				meta.set(kv[1].toLowerCase(), kv[2].trim());
			}

			assert.deepEqual([...meta.keys()].sort(), ["description", "name", "order", "placement"]);
			assert.ok(meta.get("name"), "name is set");
			assert.ok(meta.get("description"), "description is set");
			assert.match(meta.get("placement") ?? "", /^(prepend|append)$/);
			assert.match(meta.get("order") ?? "", /^\d+$/);
			assert.ok((match[2] ?? "").trim(), "body is not empty");
		});
	}

	it("uses unique names and unique orders within each placement group", () => {
		const seenNames = new Set<string>();
		const seenOrders = new Set<string>();
		for (const file of files) {
			const raw = readFileSync(join(snippetsDir, file), "utf8");
			const name = raw.match(/^name:\s*(.*)$/m)?.[1]?.trim() ?? "";
			const placement = raw.match(/^placement:\s*(.*)$/m)?.[1]?.trim() ?? "";
			const order = raw.match(/^order:\s*(.*)$/m)?.[1]?.trim() ?? "";
			assert.ok(!seenNames.has(name), `duplicate name ${name}`);
			assert.ok(!seenOrders.has(`${placement}:${order}`), `duplicate ${placement} order ${order}`);
			seenNames.add(name);
			seenOrders.add(`${placement}:${order}`);
		}
	});
});
