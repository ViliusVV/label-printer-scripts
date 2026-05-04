# quick-input-nest — Claude Code notes

## Ad-hoc scripts go in `scripts/adhoc/`

Never inline long Bash or PowerShell scripts in tool calls (heredocs, `cat > file <<EOF`, multi-line shell pipelines, throwaway Node/Bun snippets used for diagnostics). Save them as files in `scripts/adhoc/` and run them by path. This includes diagnostic probes (`ws-probe.ts`, `upgrade-echo.ts`, etc.), one-off curl batches, and any scripted reproduction of a bug.

`scripts/` itself is for repo utilities that are part of the workflow (`bun run smoke`, `bun run e2e`, `bun run cert`); `scripts/adhoc/` is for throwaway debugging code that may stay around but isn't wired into `package.json`.
