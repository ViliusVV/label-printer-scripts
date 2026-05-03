# quick-input-nest-rxdb

NestJS + Solid rewrite of the quick input app using **RxDB** on the client and shared types reused by both frontend and backend.

## Stack

- **Backend:** NestJS on Bun
- **Frontend:** Solid + Vite
- **Client state:** RxDB
- **Shared contracts:** `src/shared/inputs.ts`
- **Storage:** append-only text file at `../data/inputs.txt`

## Commands

```powershell
cd C:\Users\viliu\PycharmProjects\label-printer\quick-input-nest-rxdb
bun install
bun run dev
```

```powershell
cd C:\Users\viliu\PycharmProjects\label-printer\quick-input-nest-rxdb
bun run build
bun run start
```

```powershell
cd C:\Users\viliu\PycharmProjects\label-printer\quick-input-nest-rxdb
bun run check
bun run smoke
bun run e2e
```

## Notes

- The server listens on port `3300` by default.
- The Vite dev server proxies `/api` to the Nest backend.
- The client stores the visible list in an RxDB collection and refreshes it from the backend.
- `bun run e2e` builds the client first, then validates static serving and REST input flows using a temporary inputs file.
- Override the storage file with `INPUTS_FILE` and the port with `PORT` if needed.

