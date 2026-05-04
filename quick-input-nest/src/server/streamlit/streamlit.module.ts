import { Module } from "@nestjs/common";
import { StreamlitManagerService } from "./streamlit.service";

@Module({
  providers: [StreamlitManagerService],
  exports: [StreamlitManagerService],
})
export class StreamlitModule {}
