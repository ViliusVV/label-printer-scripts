import { BadRequestException, Controller, Get, NotFoundException, Post, Body } from "@nestjs/common";
import {
  addInputBodySchema,
  deleteInputBodySchema,
  type InputItem,
  type OkResponse,
} from "../../shared/contracts";
import { InputStorageService } from "./input-storage.service";

@Controller("api/inputs")
export class InputsController {
  constructor(private readonly storage: InputStorageService) {}

  @Get("list")
  async list(): Promise<InputItem[]> {
    return this.storage.listLatest();
  }

  @Post("add")
  async add(@Body() body: unknown): Promise<OkResponse> {
    const parsed = addInputBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.storage.add(parsed.data.text);
    return { ok: true };
  }

  @Post("delete")
  async delete(@Body() body: unknown): Promise<OkResponse> {
    const parsed = deleteInputBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const removed = await this.storage.deleteByAbsoluteIndex(parsed.data.index);
    if (!removed) {
      throw new NotFoundException({ ok: false, message: "Entry not found" });
    }

    return { ok: true };
  }
}

