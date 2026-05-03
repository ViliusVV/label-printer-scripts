import { BadRequestException, Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import {
  createNoteBodySchema,
  deleteByIdBodySchema,
  type NoteItem,
  type OkResponse,
  updateNoteBodySchema,
} from "../../shared/contracts";
import { GeneralDbService } from "./general-db.service";

@Controller("api/notes")
export class NotesController {
  constructor(private readonly generalDb: GeneralDbService) {}

  @Get("list")
  async list(): Promise<NoteItem[]> {
    return this.generalDb.listNotes();
  }

  @Post("create")
  async create(@Body() body: unknown): Promise<NoteItem> {
    const parsed = createNoteBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.generalDb.createNote(parsed.data);
  }

  @Post("update")
  async update(@Body() body: unknown): Promise<NoteItem> {
    const parsed = updateNoteBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const updated = await this.generalDb.updateNote(parsed.data);
    if (!updated) {
      throw new NotFoundException({ ok: false, message: "Note not found" });
    }
    return updated;
  }

  @Post("delete")
  async delete(@Body() body: unknown): Promise<OkResponse> {
    const parsed = deleteByIdBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const removed = await this.generalDb.deleteNote(parsed.data.id);
    if (!removed) {
      throw new NotFoundException({ ok: false, message: "Note not found" });
    }
    return { ok: true };
  }
}

