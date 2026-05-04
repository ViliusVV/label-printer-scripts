import { Module } from "@nestjs/common";
import { InputsModule } from "./inputs/inputs.module";
import { StreamlitModule } from "./streamlit/streamlit.module";

@Module({
  imports: [InputsModule, StreamlitModule],
})
export class AppModule {}

