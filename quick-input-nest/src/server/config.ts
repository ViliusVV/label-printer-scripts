import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dir, "..", "..");

export const HOST = process.env.HOST ?? "0.0.0.0";
export const PORT = Number.parseInt(process.env.PORT ?? "3300", 10);
export const MAX_ITEMS = Number.parseInt(process.env.MAX_ITEMS ?? "10", 10);
export const INPUTS_FILE = process.env.INPUTS_FILE ?? resolve(projectRoot, "..", "data", "inputs.txt");
export const CLIENT_DIR = resolve(projectRoot, "dist", "client");
export const CLIENT_ASSETS_DIR = resolve(CLIENT_DIR, "assets");
export const INDEX_HTML = resolve(CLIENT_DIR, "index.html");

