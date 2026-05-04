import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { RPCHandler } from "@orpc/server/node";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Request, Response } from "express";
import httpProxy from "http-proxy";
import { AppModule } from "./app.module";
import { CLIENT_DIR, HOST, INDEX_HTML, INPUTS_FILE, PORT, STREAMLIT_BASE_PATH } from "./config";
import { InputsController } from "./inputs/inputs.controller";
import { createAppRouter } from "./orpc/app.router";
import { StreamlitManagerService } from "./streamlit/streamlit.service";

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
  const inputsController = app.get(InputsController);
  const streamlit = app.get(StreamlitManagerService);
  const expressApp = app.getHttpAdapter().getInstance();
  const rpcHandler = new RPCHandler(createAppRouter(inputsController));

  app.enableCors({ origin: true });
  app.enableShutdownHooks();

  if (existsSync(CLIENT_DIR)) {
    app.useStaticAssets(CLIENT_DIR, { index: false });
  }

  expressApp.use("/api/rpc{*path}", async (req: Request, res: Response, next: () => void) => {
    const { matched } = await rpcHandler.handle(req, res, {
      prefix: "/api/rpc",
      context: {},
    });
    if (matched) return;
    next();
  });

  const streamlitProxy = httpProxy.createProxyServer({
    target: streamlit.target,
    changeOrigin: true,
    ws: true,
  });
  streamlitProxy.on("error", (err) => log.error(`proxy error: ${err.message}`));

  // Mount at root (not `/streamlit`) so Express doesn't strip the prefix —
  // Streamlit was launched with --server.baseUrlPath=streamlit and 404s
  // without it.
  expressApp.use(async (req: Request, res: Response, next: (err?: unknown) => void) => {
    if (!req.url?.startsWith(`/${STREAMLIT_BASE_PATH}`)) {
      next();
      return;
    }
    try {
      await streamlit.ensureStarted();
    } catch (err) {
      res.status(502).type("text/plain").send(`Streamlit failed to start: ${(err as Error).message}`);
      return;
    }
    streamlitProxy.web(req, res);
  });

  expressApp.get(/^\/(?!api\/rpc(?:\/|$)|assets(?:\/|$)|streamlit(?:\/|$)).*/, sendClient);

  await app.listen(port, host);

  // Forward WS upgrades to Streamlit. Tracks active sessions so the manager
  // can shut Streamlit down once the iframe closes. NOTE: needs Node runtime
  // — Bun's node:http drops socket.write after upgrade (oven-sh/bun#28396).
  const httpServer = app.getHttpServer();
  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith(`/${STREAMLIT_BASE_PATH}`)) return;
    void streamlit
      .ensureStarted()
      .then(() => {
        streamlit.acquire();
        socket.once("close", () => streamlit.release());
        streamlitProxy.ws(req, socket, head);
      })
      .catch((err) => {
        log.error(`Streamlit upgrade aborted: ${(err as Error).message}`);
        socket.destroy();
      });
  });

  log.log(`Quick Input Nest listening on http://${host}:${port} -> writing to ${INPUTS_FILE}`);
  return app;
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  void bootstrap();
}
