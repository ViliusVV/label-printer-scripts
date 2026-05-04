import { Inject, Injectable } from "@nestjs/common";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { transformInput } from "../../shared/transform";
import type { InputItem, SyncedItem } from "./input.types";
import { INPUTS_FILE_PATH, INPUTS_MAX_ITEMS, INPUTS_TRANSFORMED_FILE_PATH } from "./inputs.constants";

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    transformed TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

@Injectable()
export class InputStorageService {
  constructor(
    @Inject(INPUTS_FILE_PATH) private readonly filePath: string,
    @Inject(INPUTS_TRANSFORMED_FILE_PATH) private readonly transformedFilePath: string,
    @Inject(INPUTS_MAX_ITEMS) private readonly maxItems: number = 10,
  ) {}

  private async readLines(path: string): Promise<string[]> {
    try {
      const data = await readFile(path, "utf-8");
      return data.split(/\r?\n/);
    } catch {
      return [];
    }
  }

  private readRawLines(): Promise<string[]> {
    return this.readLines(this.filePath);
  }

  private readTransformedLines(): Promise<string[]> {
    return this.readLines(this.transformedFilePath);
  }

  private static toIndexedItems(lines: string[]): InputItem[] {
    return lines
      .map((line, index) => ({ index, text: line.trim() }))
      .filter((item) => item.text.length > 0);
  }

  private async writeLines(path: string, lines: string[]): Promise<void> {
    const nonTrailing = [...lines];
    while (nonTrailing.length > 0 && nonTrailing.at(-1) === "") {
      nonTrailing.pop();
    }
    const content = nonTrailing.length > 0 ? `${nonTrailing.join("\n")}\n` : "";
    await writeFile(path, content, "utf-8");
  }

  async add(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    const transformed = transformInput(trimmed);
    if (transformed === null) {
      throw new Error("Cant transform");
    }

    await appendFile(this.filePath, `${trimmed}\n`, "utf-8");
    await appendFile(this.transformedFilePath, `${transformed}\n`, "utf-8");
  }

  async listLatest(): Promise<InputItem[]> {
    const lines = await this.readRawLines();
    return InputStorageService.toIndexedItems(lines).reverse().slice(0, this.maxItems);
  }

  async clear(): Promise<void> {
    await writeFile(this.filePath, "", "utf-8");
    await writeFile(this.transformedFilePath, "", "utf-8");
  }

  async deleteByAbsoluteIndex(index: number): Promise<boolean> {
    const rawLines = await this.readRawLines();
    if (index < 0 || index >= rawLines.length) {
      return false;
    }

    if (rawLines[index].trim().length === 0) {
      return false;
    }

    const transformedLines = await this.readTransformedLines();
    rawLines.splice(index, 1);
    if (index < transformedLines.length) {
      transformedLines.splice(index, 1);
    }
    await this.writeLines(this.filePath, rawLines);
    await this.writeLines(this.transformedFilePath, transformedLines);
    return true;
  }

  async snapshot(): Promise<SyncedItem[]> {
    const [rawLines, transformedLines] = await Promise.all([
      this.readRawLines(),
      this.readTransformedLines(),
    ]);
    const items: SyncedItem[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const text = rawLines[i].trim();
      if (text.length === 0) continue;
      const transformed = (transformedLines[i] ?? "").trim() || (transformInput(text) ?? "");
      items.push({ index: i, text, transformed });
    }
    return items;
  }

  async replaceAll(items: ReadonlyArray<{ text: string; transformed: string }>): Promise<void> {
    const cleaned = items
      .map((it) => ({ text: it.text.trim(), transformed: it.transformed.trim() }))
      .filter((it) => it.text.length > 0);
    await this.writeLines(
      this.filePath,
      cleaned.map((it) => it.text),
    );
    await this.writeLines(
      this.transformedFilePath,
      cleaned.map((it) => it.transformed),
    );
  }

  async exportBlob(): Promise<Buffer> {
    const items = await this.snapshot();
    const dir = await mkdtemp(join(tmpdir(), "qin-sqlite-"));
    const dbPath = join(dir, "inputs.sqlite3");
    try {
      const db = new DatabaseSync(dbPath);
      try {
        db.exec(SCHEMA_SQL);
        const stmt = db.prepare(
          "INSERT INTO inputs (text, transformed, created_at) VALUES (?, ?, ?)",
        );
        const now = Date.now();
        for (const item of items) {
          stmt.run(item.text, item.transformed, now);
        }
      } finally {
        db.close();
      }
      return await readFile(dbPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async importBlob(blob: Uint8Array): Promise<number> {
    const dir = await mkdtemp(join(tmpdir(), "qin-sqlite-"));
    const dbPath = join(dir, "inputs.sqlite3");
    try {
      await writeFile(dbPath, blob);
      const db = new DatabaseSync(dbPath, { readOnly: true });
      let rows: ReadonlyArray<{ text: unknown; transformed: unknown }>;
      try {
        rows = db
          .prepare("SELECT text, transformed FROM inputs ORDER BY id ASC")
          .all() as unknown as ReadonlyArray<{ text: unknown; transformed: unknown }>;
      } finally {
        db.close();
      }
      const items = rows
        .map((r) => ({
          text: typeof r.text === "string" ? r.text : "",
          transformed: typeof r.transformed === "string" ? r.transformed : "",
        }))
        .filter((it) => it.text.length > 0);
      await this.replaceAll(items);
      return items.length;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
