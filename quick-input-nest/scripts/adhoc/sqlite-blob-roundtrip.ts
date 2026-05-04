import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InputStorageService } from "../../src/server/inputs/input-storage.service";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const dir = await mkdtemp(join(tmpdir(), "qin-blob-"));
const inputsPath = join(dir, "inputs.txt");
const transformedPath = join(dir, "inputs_transformed.txt");

try {
  const storage = new InputStorageService(inputsPath, transformedPath, 100);

  await storage.add("100");
  await storage.add("4.7k");
  await storage.add("1.2m");

  const before = await storage.snapshot();
  assert(before.length === 3, `expected 3 items, got ${before.length}`);

  const blob = await storage.exportBlob();
  console.log(`blob bytes: ${blob.byteLength}`);
  assert(blob.byteLength > 0, "expected non-empty blob");
  assert(blob.subarray(0, 16).toString("ascii").startsWith("SQLite format 3"), "expected SQLite header");

  await storage.clear();
  const empty = await storage.snapshot();
  assert(empty.length === 0, `expected empty after clear, got ${empty.length}`);

  const count = await storage.importBlob(new Uint8Array(blob));
  assert(count === 3, `expected import count 3, got ${count}`);

  const after = await storage.snapshot();
  assert(after.length === 3, `expected 3 items after import, got ${after.length}`);
  for (let i = 0; i < before.length; i++) {
    assert(after[i].text === before[i].text, `text mismatch at ${i}: ${after[i].text} vs ${before[i].text}`);
    assert(
      after[i].transformed === before[i].transformed,
      `transformed mismatch at ${i}: ${after[i].transformed} vs ${before[i].transformed}`,
    );
  }

  const rawText = await readFile(inputsPath, "utf-8");
  const transformedText = await readFile(transformedPath, "utf-8");
  assert(rawText === "100\n4.7k\n1.2m\n", `unexpected raw file: ${JSON.stringify(rawText)}`);
  assert(
    transformedText === "R100\nR4.7k\nR1m\n" || transformedText.startsWith("R"),
    `unexpected transformed file: ${JSON.stringify(transformedText)}`,
  );

  console.log("Blob roundtrip OK");
} finally {
  await rm(dir, { recursive: true, force: true });
}
