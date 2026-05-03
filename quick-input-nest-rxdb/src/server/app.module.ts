import { Module } from "@nestjs/common";
import { InputsModule } from "./inputs/inputs.module";

@Module({
  imports: [InputsModule],
})
export class AppModule {}

