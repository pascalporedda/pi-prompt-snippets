import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../index.ts";

const tempDirs: string[] = [];
process.on("exit", () => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** Fresh temporary directory, removed when the test process exits. */
export function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-prompt-snippets-test-"));
	tempDirs.push(dir);
	return dir;
}

// Never let a test read the real user's agent directory or prompt-snippets.json.
process.env.PI_CODING_AGENT_DIR = makeTempDir();

export const KEYS = {
	up: "\x1b[A",
	down: "\x1b[B",
	space: " ",
	tab: "\t",
	enter: "\r",
	escape: "\x1b",
} as const;

export type KeyName = keyof typeof KEYS;

type Handler = (event: unknown, ctx: FakeContext) => unknown;
type CommandHandler = (args: string, ctx: FakeContext) => Promise<void>;
type ShortcutHandler = (ctx: FakeContext) => Promise<void>;

interface MenuComponent {
	render(width: number): string[];
	handleInput(data: string): void;
}

type MenuFactory = (
	tui: { terminal: { rows: number }; requestRender(): void },
	theme: FakeTheme,
	keybindings: unknown,
	done: (result: boolean) => void,
) => MenuComponent;

interface FakeTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export interface FakeContext {
	hasUI: boolean;
	mode: string;
	ui: {
		theme: FakeTheme;
		setWidget(id: string, lines: string[] | undefined): void;
		notify(message: string, level: string): void;
		custom(factory: MenuFactory): Promise<boolean | undefined>;
	};
}

export interface MenuSession {
	/** Key presses sent to the menu, in order. The script should end with enter or escape. */
	keys: KeyName[];
	/** Rendered frames captured after every key press (and once before the first). */
	frames: string[][];
}

export interface Harness {
	handlers: Map<string, Handler>;
	commands: Map<string, { description: string; handler: CommandHandler }>;
	shortcuts: Map<string, { description: string; handler: ShortcutHandler }>;
	widgets: (string[] | undefined)[];
	notifications: { message: string; level: string }[];
	menus: MenuSession[];
	ctx: FakeContext;
	/** Isolated Pi agent directory (PI_CODING_AGENT_DIR) used by this harness. */
	agentDir: string;
	/** Queue the key presses for the next menu opening. */
	queueMenu(keys: KeyName[]): MenuSession;
	sessionStart(): Promise<void>;
	openMenu(keys: KeyName[]): Promise<MenuSession>;
	send(text: string): Promise<unknown>;
}

const plainTheme: FakeTheme = {
	fg: (_color, text) => text,
	bold: (text) => text,
};

export function createHarness(options: { mode?: string; rows?: number; agentDir?: string } = {}): Harness {
	const agentDir = options.agentDir ?? makeTempDir();
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, { description: string; handler: CommandHandler }>();
	const shortcuts = new Map<string, { description: string; handler: ShortcutHandler }>();
	const widgets: (string[] | undefined)[] = [];
	const notifications: { message: string; level: string }[] = [];
	const menus: MenuSession[] = [];
	const pending: MenuSession[] = [];

	const ctx: FakeContext = {
		hasUI: true,
		mode: options.mode ?? "tui",
		ui: {
			theme: plainTheme,
			setWidget: (_id, lines) => {
				widgets.push(lines);
			},
			notify: (message, level) => {
				notifications.push({ message, level });
			},
			custom: async (factory) => {
				const session = pending.shift();
				if (!session) throw new Error("Menu opened without queued key presses");
				menus.push(session);

				let result: boolean | undefined;
				const tui = { terminal: { rows: options.rows ?? 40 }, requestRender() {} };
				const component = factory(tui, plainTheme, undefined, (value) => {
					result = value;
				});
				session.frames.push(component.render(80));
				for (const key of session.keys) {
					if (result !== undefined) throw new Error(`Key "${key}" sent after the menu closed`);
					component.handleInput(KEYS[key]);
					session.frames.push(component.render(80));
				}
				return result;
			},
		},
	};

	// Only the registration surface used by the extension is implemented.
	const pi = {
		on: (event: string, handler: Handler) => {
			handlers.set(event, handler);
		},
		registerCommand: (name: string, command: { description: string; handler: CommandHandler }) => {
			commands.set(name, command);
		},
		registerShortcut: (key: string, shortcut: { description: string; handler: ShortcutHandler }) => {
			shortcuts.set(key, shortcut);
		},
	};
	// The fake implements a narrow subset of ExtensionAPI; the cast is limited to this test harness.
	extension(pi as unknown as ExtensionAPI);

	const queueMenu = (keys: KeyName[]): MenuSession => {
		const session: MenuSession = { keys, frames: [] };
		pending.push(session);
		return session;
	};

	const handler = (event: string): Handler => {
		const registered = handlers.get(event);
		if (!registered) throw new Error(`No handler registered for ${event}`);
		return registered;
	};

	return {
		handlers,
		commands,
		shortcuts,
		widgets,
		notifications,
		menus,
		ctx,
		agentDir,
		queueMenu,
		sessionStart: async () => {
			process.env.PI_CODING_AGENT_DIR = agentDir;
			await handler("session_start")({ type: "session_start" }, ctx);
		},
		openMenu: async (keys) => {
			const session = queueMenu(keys);
			const command = commands.get("snippets");
			if (!command) throw new Error("/snippets command not registered");
			await command.handler("", ctx);
			return session;
		},
		send: async (text) => handler("input")({ type: "input", text, source: "interactive" }, ctx),
	};
}
