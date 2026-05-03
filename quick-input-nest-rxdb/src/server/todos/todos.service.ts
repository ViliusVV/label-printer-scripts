import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateTodoBody,
  type TodoItem,
  type UpdateTodoBody,
  createId,
  nowIso,
} from "../../shared/contracts";
import { readJsonFile, writeJsonFile } from "../storage/json-file";
import { TODOS_FILE_PATH } from "./todos.constants";

@Injectable()
export class TodosService {
  constructor(@Inject(TODOS_FILE_PATH) private readonly filePath: string) {}

  private async readTodos(): Promise<TodoItem[]> {
    return readJsonFile(this.filePath, [] as TodoItem[]);
  }

  private async writeTodos(todos: TodoItem[]): Promise<void> {
    await writeJsonFile(this.filePath, todos);
  }

  async list(): Promise<TodoItem[]> {
    const todos = await this.readTodos();
    return [...todos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(body: CreateTodoBody): Promise<TodoItem> {
    const todos = await this.readTodos();
    const now = nowIso();
    const todo: TodoItem = {
      id: createId("todo"),
      title: body.title.trim(),
      details: body.details,
      state: body.state,
      createdAt: now,
      updatedAt: now,
    };
    todos.push(todo);
    await this.writeTodos(todos);
    return todo;
  }

  async update(body: UpdateTodoBody): Promise<TodoItem | null> {
    const todos = await this.readTodos();
    const index = todos.findIndex((todo) => todo.id === body.id);
    if (index < 0) {
      return null;
    }

    const updated: TodoItem = {
      ...todos[index],
      title: body.title.trim(),
      details: body.details,
      state: body.state,
      updatedAt: nowIso(),
    };
    todos[index] = updated;
    await this.writeTodos(todos);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const todos = await this.readTodos();
    const filtered = todos.filter((todo) => todo.id !== id);
    if (filtered.length === todos.length) {
      return false;
    }

    await this.writeTodos(filtered);
    return true;
  }
}

