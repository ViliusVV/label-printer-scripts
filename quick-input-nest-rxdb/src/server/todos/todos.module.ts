import { Module } from "@nestjs/common";
import { TODOS_FILE } from "../config";
import { TODOS_FILE_PATH } from "./todos.constants";
import { TodosService } from "./todos.service";

@Module({
  providers: [{ provide: TODOS_FILE_PATH, useValue: TODOS_FILE }, TodosService],
  exports: [TodosService],
})
export class TodosModule {}

