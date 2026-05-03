import { z } from "zod";

export const inputItemSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
});

export const inputListSchema = z.array(inputItemSchema);
export const addInputBodySchema = z.object({ text: z.string() });
export const deleteInputBodySchema = z.object({ index: z.number().int().nonnegative() });
export const okResponseSchema = z.object({ ok: z.literal(true) });
export const errorResponseSchema = z.object({ ok: z.literal(false), message: z.string() });

export type InputItem = z.infer<typeof inputItemSchema>;
export type InputList = z.infer<typeof inputListSchema>;
export type AddInputBody = z.infer<typeof addInputBodySchema>;
export type DeleteInputBody = z.infer<typeof deleteInputBodySchema>;
export type OkResponse = z.infer<typeof okResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const inputCollectionSchema = {
  title: "quick-input entries",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 128 },
    index: { type: "number", minimum: 0, multipleOf: 1 },
    text: { type: "string" },
  },
  required: ["id", "index", "text"],
  additionalProperties: false,
} as const;

export const toInputItem = (index: number, text: string): InputItem => ({
  id: String(index),
  index,
  text,
});

