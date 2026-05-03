import { Injectable } from "@nestjs/common";
import type { JsonEntityKey, JsonEntityMap, JsonPushMutation } from "../../shared/contracts";
import { GeneralDbService } from "../general-db/general-db.service";
import { TodosService } from "../todos/todos.service";

@Injectable()
export class JsonReplicationService {
  constructor(
    private readonly todos: TodosService,
    private readonly generalDb: GeneralDbService,
  ) {}

  async pull<K extends JsonEntityKey>(entity: K): Promise<JsonEntityMap[K][]> {
    switch (entity) {
      case "todos":
        return (await this.todos.list()) as JsonEntityMap[K][];
      case "notes":
        return (await this.generalDb.listNotes()) as JsonEntityMap[K][];
      case "bookmarks":
        return (await this.generalDb.listBookmarks()) as JsonEntityMap[K][];
      case "contacts":
        return (await this.generalDb.listContacts()) as JsonEntityMap[K][];
    }
  }

  async push<K extends JsonEntityKey>(entity: K, mutations: JsonPushMutation<K>[]): Promise<void> {
    for (const mutation of mutations) {
      if (mutation.op === "upsert") {
        await this.upsert(entity, mutation.doc as JsonEntityMap[K]);
      } else {
        await this.delete(entity, mutation.id);
      }
    }
  }

  private async upsert<K extends JsonEntityKey>(entity: K, doc: JsonEntityMap[K]): Promise<void> {
    switch (entity) {
      case "todos": {
        const todo = doc as JsonEntityMap["todos"];
        const existing = await this.todos.update({
          id: todo.id,
          title: todo.title,
          details: todo.details,
          state: todo.state,
          updatedAt: todo.updatedAt,
        });
        if (!existing) {
          await this.todos.create({
            id: todo.id,
            title: todo.title,
            details: todo.details,
            state: todo.state,
            createdAt: todo.createdAt,
            updatedAt: todo.updatedAt,
          });
        }
        return;
      }
      case "notes": {
        const note = doc as JsonEntityMap["notes"];
        const existing = await this.generalDb.updateNote({
          id: note.id,
          name: note.name,
          body: note.body,
          color: note.color,
          updatedAt: note.updatedAt,
        });
        if (!existing) {
          await this.generalDb.createNote({
            id: note.id,
            name: note.name,
            body: note.body,
            color: note.color,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          });
        }
        return;
      }
      case "bookmarks": {
        const bookmark = doc as JsonEntityMap["bookmarks"];
        const existing = await this.generalDb.updateBookmark({
          id: bookmark.id,
          name: bookmark.name,
          url: bookmark.url,
          category: bookmark.category,
          updatedAt: bookmark.updatedAt,
        });
        if (!existing) {
          await this.generalDb.createBookmark({
            id: bookmark.id,
            name: bookmark.name,
            url: bookmark.url,
            category: bookmark.category,
            createdAt: bookmark.createdAt,
            updatedAt: bookmark.updatedAt,
          });
        }
        return;
      }
      case "contacts": {
        const contact = doc as JsonEntityMap["contacts"];
        const existing = await this.generalDb.updateContact({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          company: contact.company,
          updatedAt: contact.updatedAt,
        });
        if (!existing) {
          await this.generalDb.createContact({
            id: contact.id,
            name: contact.name,
            email: contact.email,
            company: contact.company,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
          });
        }
      }
    }
  }

  private async delete(entity: JsonEntityKey, id: string): Promise<void> {
    switch (entity) {
      case "todos":
        await this.todos.delete(id);
        return;
      case "notes":
        await this.generalDb.deleteNote(id);
        return;
      case "bookmarks":
        await this.generalDb.deleteBookmark(id);
        return;
      case "contacts":
        await this.generalDb.deleteContact(id);
    }
  }
}

