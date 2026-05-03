import { Inject, Injectable } from "@nestjs/common";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { transformInput } from "../../shared/transform";
import type { InputItem } from "./input.types";
import { INPUTS_FILE_PATH, INPUTS_MAX_ITEMS } from "./inputs.constants";

@Injectable()
export class InputStorageService {
  constructor(
    @Inject(INPUTS_FILE_PATH) private readonly filePath: string,
    @Inject(INPUTS_MAX_ITEMS) private readonly maxItems: number = 10,
  ) {}

  private async readRawLines(): Promise<string[]> {
    try {
      const data = await readFile(this.filePath, "utf-8");
      return data.split(/\r?\n/);
    } catch {
      return [];
    }
  }

  private static toIndexedItems(lines: string[]): InputItem[] {
    return lines
      .map((line, index) => ({ index, text: line.trim() }))
      .filter((item) => item.text.length > 0);
  }

  private async writeRawLines(lines: string[]): Promise<void> {
    const nonTrailing = [...lines];
    while (nonTrailing.length > 0 && nonTrailing.at(-1) === "") {
      nonTrailing.pop();
    }
    const content = nonTrailing.length > 0 ? `${nonTrailing.join("\n")}\n` : "";
    await writeFile(this.filePath, content, "utf-8");
  }

  async add(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    await appendFile(this.filePath, `${trimmed}\n`, "utf-8");

    const transformed = transformInput(trimmed);
    await appendFile("inputs_transformed.txt", `${transformed}\n`, "utf-8");
  }

  async listLatest(): Promise<InputItem[]> {
    const lines = await this.readRawLines();
    return InputStorageService.toIndexedItems(lines).reverse().slice(0, this.maxItems);
  }

  async deleteByAbsoluteIndex(index: number): Promise<boolean> {
    const lines = await this.readRawLines();
    if (index < 0 || index >= lines.length) {
      return false;
    }

    if (lines[index].trim().length === 0) {
      return false;
    }

    lines.splice(index, 1);
    await this.writeRawLines(lines);
    return true;
  }
}

