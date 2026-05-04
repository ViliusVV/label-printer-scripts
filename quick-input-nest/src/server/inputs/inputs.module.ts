import { Module } from "@nestjs/common";
import { MAX_ITEMS, INPUTS_FILE, INPUTS_TRANSFORMED_FILE } from "../config";
import { InputStorageService } from "./input-storage.service";
import { InputsController } from "./inputs.controller";
import { INPUTS_FILE_PATH, INPUTS_TRANSFORMED_FILE_PATH, INPUTS_MAX_ITEMS } from "./inputs.constants";

@Module({
  providers: [
    { provide: INPUTS_FILE_PATH, useValue: INPUTS_FILE },
    { provide: INPUTS_TRANSFORMED_FILE_PATH, useValue: INPUTS_TRANSFORMED_FILE },
    { provide: INPUTS_MAX_ITEMS, useValue: MAX_ITEMS },
    InputStorageService,
    InputsController,
  ],
  exports: [InputStorageService, InputsController],
})
export class InputsModule {}
