import { ORPCError, os } from "@orpc/server";
import type { InputStorageService } from "../inputs/input-storage.service";

export type ORPCContext = {
  inputs: InputStorageService;
};

export const base = os.$context<ORPCContext>();
export { ORPCError };
