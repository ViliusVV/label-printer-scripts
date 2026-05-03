import { Module } from "@nestjs/common";
import { GeneralDbModule } from "./general-db/general-db.module";
import { InputsModule } from "./inputs/inputs.module";
import { JsonReplicationController } from "./replication/json-replication.controller";
import { JsonReplicationService } from "./replication/json-replication.service";
import { TodosModule } from "./todos/todos.module";

@Module({
  imports: [InputsModule, TodosModule, GeneralDbModule],
  controllers: [JsonReplicationController],
  providers: [JsonReplicationService],
})
export class AppModule {}

