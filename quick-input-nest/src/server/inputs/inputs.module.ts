import { Module } from "@nestjs/common";
import { MAX_ITEMS, INPUTS_FILE } from "../config";
import { InputStorageService } from "./input-storage.service";
import { INPUTS_FILE_PATH, INPUTS_MAX_ITEMS } from "./inputs.constants";

@Module({
  providers: [
    { provide: INPUTS_FILE_PATH, useValue: INPUTS_FILE },
    { provide: INPUTS_MAX_ITEMS, useValue: MAX_ITEMS },
    InputStorageService,
  ],
  exports: [InputStorageService],
})
export class InputsModule {}

