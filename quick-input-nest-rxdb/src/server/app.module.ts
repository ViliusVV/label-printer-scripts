import { Module } from "@nestjs/common";
import { GeneralDbModule } from "./general-db/general-db.module";
import { InputsModule } from "./inputs/inputs.module";
import { TodosModule } from "./todos/todos.module";

@Module({
  imports: [InputsModule, TodosModule, GeneralDbModule],
})
export class AppModule {}

