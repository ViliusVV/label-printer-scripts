# quick-input-nest

NestJS + oRPC + Solid rewrite of the original `quick-input` app.

## Stack

- **Backend:** NestJS on Bun
- **API:** oRPC
- **Frontend:** Solid + Vite
- **Storage:** append-only text file at `../data/inputs.txt`

## Commands

```powershell
cd C:\Users\viliu\PycharmProjects\label-printer\quick-input-nest
bun install
bun run dev
```

Production-style run:

```powershell
cd C:\Users\viliu\PycharmProjects\label-printer\quick-input-nest
bun install
bun run build
bun run start
```

Validation:

```powershell
cd C:\Users\viliu\PycharmProjects\label-printer\quick-input-nest
bun run check
bun run smoke
bun run e2e
```

## Notes

- The server listens on port `3300` by default.
- The Vite dev server proxies `/api/rpc` to the Nest backend.
- In production mode, Nest serves `dist/client` and the `/assets` bundle directly.
- `bun run e2e` builds the client first, then checks static serving plus the typed oRPC flow against a temporary inputs file.
- Override the storage file with `INPUTS_FILE` and the port with `PORT` if needed.

