# quick-input-nest-rxdb

NestJS + Solid rewrite of the quick input app using **RxDB** on the client, **TanStack Router** for tabbed routes, and shared types reused by both frontend and backend.

## Stack

- **Backend:** NestJS on Bun
- **Frontend:** Solid + Vite + TanStack Router
- **Client state:** RxDB + persistent optimistic mutation queue
- **Shared contracts:** `src/shared/contracts.ts`
- **Storage:** `inputs.txt`, `todo.json`, and `general_db.json`

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
- The app is installable as a PWA and ships a generated manifest + service worker.
- The client stores five routed entity tabs in RxDB collections: Inputs, Todos, Notes, Bookmarks, and Contacts.
- The app demonstrates three sync-source styles: a text file (`inputs.txt`), a dedicated JSON file (`todo.json`), and several collections sharing one JSON database (`general_db.json`).
- Todos, Notes, Bookmarks, and Contacts now use a local-first optimistic mutation outbox that replays on reconnect; this is the first step toward full replication.
- Inputs still use the original server-first text-file flow because the current line-index API is not yet a good fit for offline mutation replay.
- `bun run e2e` builds the client first, then validates static serving and REST CRUD flows using temporary inputs, todo, and general-db files.
- Override the storage files with `INPUTS_FILE`, `TODOS_FILE`, `GENERAL_DB_FILE`, and the port with `PORT` if needed.

