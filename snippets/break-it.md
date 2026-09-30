---
name: Break it
description: Prefer breaking changes over defensive legacy compatibility
placement: append
order: 50
---
Assume the project is still in early development unless I say otherwise. Prefer breaking changes over defensive compatibility code: remove legacy paths, adapters, fallbacks, aliases, and shims that only preserve old behavior. Accept breaking API, schema, type, file, and behavior changes when they simplify the code. Refactor aggressively when it improves clarity or reduces complexity — but keep changes purposeful, with no speculative abstractions or unrelated cleanup. Migration history is not relevant either: when a schema change touches migrations added on the current feature branch, edit those existing SQL migration files in place instead of adding new ones.
