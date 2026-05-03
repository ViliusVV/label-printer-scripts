import { Module } from "@nestjs/common";
import { GENERAL_DB_FILE } from "../config";
import { GENERAL_DB_FILE_PATH } from "./general-db.constants";
import { GeneralDbService } from "./general-db.service";

@Module({
  providers: [{ provide: GENERAL_DB_FILE_PATH, useValue: GENERAL_DB_FILE }, GeneralDbService],
  exports: [GeneralDbService],
})
export class GeneralDbModule {}

