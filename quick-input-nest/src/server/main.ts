import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { RPCHandler } from "@orpc/server/node";
import { existsSync } from "node:fs";
import type { Request, Response } from "express";
import httpProxy from "http-proxy";
import { connect as netConnect } from "node:net";
import { AppModule } from "./app.module";
import {
  CLIENT_DIR,
  HOST,
  INDEX_HTML,
  INPUTS_FILE,
  PORT,
  STREAMLIT_BASE_PATH,
  STREAMLIT_HOST,
  STREAMLIT_PORT,
} from "./config";
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

  // Forward WS upgrades to Streamlit at the TCP level — re-emit the HTTP
  // upgrade request line + headers verbatim, then pipe both directions.
  // Avoids http-proxy's interaction with Bun's http server which silently
  // dropped the upgrade.
  const httpServer = app.getHttpServer();
  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith(`/${STREAMLIT_BASE_PATH}`)) return;
    void streamlit
      .ensureStarted()
      .then(() => {
        streamlit.acquire();
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          streamlit.release();
        };

        const upstream = netConnect(STREAMLIT_PORT, STREAMLIT_HOST, () => {
          const headerLines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
          for (let i = 0; i < req.rawHeaders.length; i += 2) {
            headerLines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
          }
          headerLines.push("", "");
          const reqBytes = headerLines.join("\r\n");
          log.log(`upstream connected, sending ${reqBytes.length} bytes:\n${reqBytes}`);
          upstream.write(reqBytes);
          if (head && head.length > 0) upstream.write(head);
          upstream.on("data", (b) =>
            log.log(`upstream → client ${b.length} bytes: ${b.slice(0, 200).toString()}`),
          );
          socket.on("data", (b) => log.log(`client → upstream ${b.length} bytes`));
          upstream.pipe(socket);
          socket.pipe(upstream);
        });

        const teardown = () => {
          upstream.destroy();
          socket.destroy();
          release();
        };
        upstream.on("error", (err) => {
          log.error(`upstream WS error: ${err.message}`);
          teardown();
        });
        socket.on("error", (err) => {
          log.warn(`client WS error: ${err.message}`);
          teardown();
        });
        upstream.on("close", teardown);
        socket.on("close", teardown);
      })
      .catch((err) => {
        log.error(`Streamlit upgrade aborted: ${(err as Error).message}`);
        socket.destroy();
      });
  });

  log.log(`Quick Input Nest listening on http://${host}:${port} -> writing to ${INPUTS_FILE}`);
  return app;
}

if (import.meta.main) {
  void bootstrap();
}
