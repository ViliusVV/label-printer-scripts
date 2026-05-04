import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { existsSync } from "node:fs";
import type { Request, Response } from "express";
import { AppModule } from "./app.module";
import { CLIENT_ASSETS_DIR, HOST, INDEX_HTML, INPUTS_FILE, PORT } from "./config";
import { InputStorageService } from "./inputs/input-storage.service";
import { createAppRouter } from "./trpc/app.router";

const log = new Logger("QuickInputNest");

type BootstrapOptions = {
  host?: string;
  port?: number;
};

const sendClient = (_req: Request, res: Response): void => {
  if (existsSync(INDEX_HTML)) {
    res.sendFile(INDEX_HTML);
    return;
  }

  res.status(503).type("text/plain").send("Client build not found. Run `bun run build` first.");
};

export async function bootstrap(options: BootstrapOptions = {}): Promise<NestExpressApplication> {
  const host = options.host ?? HOST;
  const port = options.port ?? PORT;
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const inputs = app.get(InputStorageService);
  const expressApp = app.getHttpAdapter().getInstance();
  const appRouter = createAppRouter(inputs);

  app.enableCors({ origin: true });

  expressApp.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: () => ({}),
    }),
  );

  expressApp.get(/^\/(?!api\/trpc(?:\/|$)|assets(?:\/|$)).*/, sendClient);

  await app.listen(port, host);
  log.log(`Quick Input Nest listening on http://${host}:${port} -> writing to ${INPUTS_FILE}`);
  return app;
}

if (import.meta.main) {
  void bootstrap();
}

