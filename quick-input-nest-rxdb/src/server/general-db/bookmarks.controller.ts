import { BadRequestException, Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import {
  createBookmarkBodySchema,
  deleteByIdBodySchema,
  type BookmarkItem,
  type OkResponse,
  updateBookmarkBodySchema,
} from "../../shared/contracts";
import { GeneralDbService } from "./general-db.service";

@Controller("api/bookmarks")
export class BookmarksController {
  constructor(private readonly generalDb: GeneralDbService) {}

  @Get("list")
  async list(): Promise<BookmarkItem[]> {
    return this.generalDb.listBookmarks();
  }

  @Post("create")
  async create(@Body() body: unknown): Promise<BookmarkItem> {
    const parsed = createBookmarkBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.generalDb.createBookmark(parsed.data);
  }

  @Post("update")
  async update(@Body() body: unknown): Promise<BookmarkItem> {
    const parsed = updateBookmarkBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const updated = await this.generalDb.updateBookmark(parsed.data);
    if (!updated) {
      throw new NotFoundException({ ok: false, message: "Bookmark not found" });
    }
    return updated;
  }

  @Post("delete")
  async delete(@Body() body: unknown): Promise<OkResponse> {
    const parsed = deleteByIdBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const removed = await this.generalDb.deleteBookmark(parsed.data.id);
    if (!removed) {
      throw new NotFoundException({ ok: false, message: "Bookmark not found" });
    }
    return { ok: true };
  }
}

