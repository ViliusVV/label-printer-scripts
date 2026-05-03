import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { existsSync } from "node:fs";
import type { Request, Response } from "express";
import { AppModule } from "./app.module";
import { CLIENT_ASSETS_DIR, GENERAL_DB_FILE, HOST, INDEX_HTML, INPUTS_FILE, PORT, TODOS_FILE } from "./config";

const log = new Logger("QuickInputNestRxdb");

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
  const expressApp = app.getHttpAdapter().getInstance();

  app.enableCors({ origin: true });

  if (existsSync(CLIENT_ASSETS_DIR)) {
    app.useStaticAssets(CLIENT_ASSETS_DIR, { prefix: "/assets" });
  }

  expressApp.get(/^\/(?!api(?:\/|$)|assets(?:\/|$)).*/, sendClient);

  await app.listen(port, host);
  log.log(
    `Quick Input Nest RxDB listening on http://${host}:${port} -> inputs=${INPUTS_FILE}, todos=${TODOS_FILE}, general=${GENERAL_DB_FILE}`,
  );
  return app;
}

if (import.meta.main) {
  void bootstrap();
}

