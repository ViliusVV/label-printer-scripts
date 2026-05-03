import { BadRequestException, Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import {
  createTodoBodySchema,
  deleteByIdBodySchema,
  type OkResponse,
  type TodoItem,
  updateTodoBodySchema,
} from "../../shared/contracts";
import { TodosService } from "./todos.service";

@Controller("api/todos")
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Get("list")
  async list(): Promise<TodoItem[]> {
    return this.todos.list();
  }

  @Post("create")
  async create(@Body() body: unknown): Promise<TodoItem> {
    const parsed = createTodoBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.todos.create(parsed.data);
  }

  @Post("update")
  async update(@Body() body: unknown): Promise<TodoItem> {
    const parsed = updateTodoBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const updated = await this.todos.update(parsed.data);
    if (!updated) {
      throw new NotFoundException({ ok: false, message: "Todo not found" });
    }
    return updated;
  }

  @Post("delete")
  async delete(@Body() body: unknown): Promise<OkResponse> {
    const parsed = deleteByIdBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const removed = await this.todos.delete(parsed.data.id);
    if (!removed) {
      throw new NotFoundException({ ok: false, message: "Todo not found" });
    }
    return { ok: true };
  }
}

