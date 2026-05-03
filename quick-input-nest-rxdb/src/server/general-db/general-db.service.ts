import { Inject, Injectable } from "@nestjs/common";
import {
  type BookmarkItem,
  type ContactItem,
  type CreateBookmarkBody,
  type CreateContactBody,
  type CreateNoteBody,
  type NoteItem,
  type UpdateBookmarkBody,
  type UpdateContactBody,
  type UpdateNoteBody,
  createId,
  nowIso,
} from "../../shared/contracts";
import { readJsonFile, writeJsonFile } from "../storage/json-file";
import { GENERAL_DB_FILE_PATH } from "./general-db.constants";

type GeneralDbShape = {
  notes: NoteItem[];
  bookmarks: BookmarkItem[];
  contacts: ContactItem[];
};

const emptyDb = (): GeneralDbShape => ({ notes: [], bookmarks: [], contacts: [] });

@Injectable()
export class GeneralDbService {
  constructor(@Inject(GENERAL_DB_FILE_PATH) private readonly filePath: string) {}

  private async readDb(): Promise<GeneralDbShape> {
    const db = await readJsonFile(this.filePath, emptyDb());
    return {
      notes: db.notes ?? [],
      bookmarks: db.bookmarks ?? [],
      contacts: db.contacts ?? [],
    };
  }

  private async writeDb(db: GeneralDbShape): Promise<void> {
    await writeJsonFile(this.filePath, db);
  }

  async listNotes(): Promise<NoteItem[]> {
    const db = await this.readDb();
    return [...db.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createNote(body: CreateNoteBody): Promise<NoteItem> {
    const db = await this.readDb();
    const now = nowIso();
    const item: NoteItem = {
      id: createId("note"),
      name: body.name.trim(),
      body: body.body,
      color: body.color,
      createdAt: now,
      updatedAt: now,
    };
    db.notes.push(item);
    await this.writeDb(db);
    return item;
  }

  async updateNote(body: UpdateNoteBody): Promise<NoteItem | null> {
    const db = await this.readDb();
    const index = db.notes.findIndex((item) => item.id === body.id);
    if (index < 0) return null;
    const updated: NoteItem = {
      ...db.notes[index],
      name: body.name.trim(),
      body: body.body,
      color: body.color,
      updatedAt: nowIso(),
    };
    db.notes[index] = updated;
    await this.writeDb(db);
    return updated;
  }

  async deleteNote(id: string): Promise<boolean> {
    const db = await this.readDb();
    const filtered = db.notes.filter((item) => item.id !== id);
    if (filtered.length === db.notes.length) return false;
    db.notes = filtered;
    await this.writeDb(db);
    return true;
  }

  async listBookmarks(): Promise<BookmarkItem[]> {
    const db = await this.readDb();
    return [...db.bookmarks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createBookmark(body: CreateBookmarkBody): Promise<BookmarkItem> {
    const db = await this.readDb();
    const now = nowIso();
    const item: BookmarkItem = {
      id: createId("bookmark"),
      name: body.name.trim(),
      url: body.url,
      category: body.category,
      createdAt: now,
      updatedAt: now,
    };
    db.bookmarks.push(item);
    await this.writeDb(db);
    return item;
  }

  async updateBookmark(body: UpdateBookmarkBody): Promise<BookmarkItem | null> {
    const db = await this.readDb();
    const index = db.bookmarks.findIndex((item) => item.id === body.id);
    if (index < 0) return null;
    const updated: BookmarkItem = {
      ...db.bookmarks[index],
      name: body.name.trim(),
      url: body.url,
      category: body.category,
      updatedAt: nowIso(),
    };
    db.bookmarks[index] = updated;
    await this.writeDb(db);
    return updated;
  }

  async deleteBookmark(id: string): Promise<boolean> {
    const db = await this.readDb();
    const filtered = db.bookmarks.filter((item) => item.id !== id);
    if (filtered.length === db.bookmarks.length) return false;
    db.bookmarks = filtered;
    await this.writeDb(db);
    return true;
  }

  async listContacts(): Promise<ContactItem[]> {
    const db = await this.readDb();
    return [...db.contacts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createContact(body: CreateContactBody): Promise<ContactItem> {
    const db = await this.readDb();
    const now = nowIso();
    const item: ContactItem = {
      id: createId("contact"),
      name: body.name.trim(),
      email: body.email,
      company: body.company,
      createdAt: now,
      updatedAt: now,
    };
    db.contacts.push(item);
    await this.writeDb(db);
    return item;
  }

  async updateContact(body: UpdateContactBody): Promise<ContactItem | null> {
    const db = await this.readDb();
    const index = db.contacts.findIndex((item) => item.id === body.id);
    if (index < 0) return null;
    const updated: ContactItem = {
      ...db.contacts[index],
      name: body.name.trim(),
      email: body.email,
      company: body.company,
      updatedAt: nowIso(),
    };
    db.contacts[index] = updated;
    await this.writeDb(db);
    return updated;
  }

  async deleteContact(id: string): Promise<boolean> {
    const db = await this.readDb();
    const filtered = db.contacts.filter((item) => item.id !== id);
    if (filtered.length === db.contacts.length) return false;
    db.contacts = filtered;
    await this.writeDb(db);
    return true;
  }
}

