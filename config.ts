import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** Config file name, resolved inside Pi's agent directory. */
export const CONFIG_FILENAME = "prompt-snippets.json";

/** Where snippets are loaded from for the current session. */
export type SnippetSource =
	| { kind: "bundled"; dir: string }
	| { kind: "configured"; dir: string; configPath: string }
	| { kind: "invalid"; configPath: string; error: string };

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expandPath(path: string, configPath: string, homeDir: string): string {
	if (path === "~") return homeDir;
	if (path.startsWith("~/")) return join(homeDir, path.slice(2));
	if (isAbsolute(path)) return path;
	return resolve(dirname(configPath), path);
}

/**
 * Read the optional config file and decide where snippets come from.
 *
 * - Missing config file, or no `snippetsDir` key: bundled snippets.
 * - `snippetsDir`: that directory replaces the bundled snippets. Absolute and
 *   `~/` paths are used as-is; relative paths resolve against the config file's
 *   directory.
 * - Unreadable file, invalid JSON, unknown keys, or a non-string/empty
 *   `snippetsDir`: an explicit error, never a silent fallback.
 */
export function resolveSnippetSource(options: {
	configPath: string;
	bundledDir: string;
	homeDir?: string;
}): SnippetSource {
	const { configPath, bundledDir, homeDir = homedir() } = options;
	const invalid = (error: string): SnippetSource => ({
		kind: "invalid",
		configPath,
		error: `Invalid prompt-snippets config ${configPath}: ${error}`,
	});

	let raw: string;
	try {
		raw = readFileSync(configPath, "utf8");
	} catch (error) {
		if (isErrnoException(error) && error.code === "ENOENT") return { kind: "bundled", dir: bundledDir };
		return invalid(`cannot read file (${error instanceof Error ? error.message : String(error)})`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return invalid(`not valid JSON (${error instanceof Error ? error.message : String(error)})`);
	}

	if (!isPlainObject(parsed)) return invalid("expected a JSON object");

	const unknownKeys = Object.keys(parsed).filter((key) => key !== "snippetsDir");
	if (unknownKeys.length > 0) return invalid(`unknown key(s) ${unknownKeys.join(", ")}; only "snippetsDir" is supported`);

	const { snippetsDir } = parsed;
	if (snippetsDir === undefined) return { kind: "bundled", dir: bundledDir };
	if (typeof snippetsDir !== "string" || snippetsDir.trim() === "") {
		return invalid(`"snippetsDir" must be a non-empty string`);
	}

	return { kind: "configured", dir: expandPath(snippetsDir, configPath, homeDir), configPath };
}

/** A usable snippet directory, or an explanation of why the source cannot be used. */
export type SnippetSourceCheck = { ok: true; dir: string } | { ok: false; error: string };

/**
 * Check the source right before loading. A configured directory must exist;
 * it is never created or replaced by the bundled snippets.
 */
export function checkSnippetSource(source: SnippetSource): SnippetSourceCheck {
	switch (source.kind) {
		case "bundled":
			return { ok: true, dir: source.dir };
		case "invalid":
			return { ok: false, error: source.error };
		case "configured": {
			const where = `Snippets directory ${source.dir} (configured in ${source.configPath})`;
			try {
				if (statSync(source.dir).isDirectory()) return { ok: true, dir: source.dir };
				return { ok: false, error: `${where} is not a directory` };
			} catch (error) {
				if (isErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
					return { ok: false, error: `${where} does not exist` };
				}
				return { ok: false, error: `${where} cannot be accessed (${error instanceof Error ? error.message : String(error)})` };
			}
		}
		default: {
			const unreachable: never = source;
			return unreachable;
		}
	}
}
