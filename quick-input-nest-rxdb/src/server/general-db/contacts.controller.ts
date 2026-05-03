import { BadRequestException, Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import {
  createContactBodySchema,
  deleteByIdBodySchema,
  type ContactItem,
  type OkResponse,
  updateContactBodySchema,
} from "../../shared/contracts";
import { GeneralDbService } from "./general-db.service";

@Controller("api/contacts")
export class ContactsController {
  constructor(private readonly generalDb: GeneralDbService) {}

  @Get("list")
  async list(): Promise<ContactItem[]> {
    return this.generalDb.listContacts();
  }

  @Post("create")
  async create(@Body() body: unknown): Promise<ContactItem> {
    const parsed = createContactBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.generalDb.createContact(parsed.data);
  }

  @Post("update")
  async update(@Body() body: unknown): Promise<ContactItem> {
    const parsed = updateContactBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const updated = await this.generalDb.updateContact(parsed.data);
    if (!updated) {
      throw new NotFoundException({ ok: false, message: "Contact not found" });
    }
    return updated;
  }

  @Post("delete")
  async delete(@Body() body: unknown): Promise<OkResponse> {
    const parsed = deleteByIdBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const removed = await this.generalDb.deleteContact(parsed.data.id);
    if (!removed) {
      throw new NotFoundException({ ok: false, message: "Contact not found" });
    }
    return { ok: true };
  }
}

