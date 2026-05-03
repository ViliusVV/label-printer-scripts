import { Module } from "@nestjs/common";
import { TODOS_FILE } from "../config";
import { TODOS_FILE_PATH } from "./todos.constants";
import { TodosController } from "./todos.controller";
import { TodosService } from "./todos.service";

@Module({
  controllers: [TodosController],
  providers: [{ provide: TODOS_FILE_PATH, useValue: TODOS_FILE }, TodosService],
  exports: [TodosService],
})
export class TodosModule {}

