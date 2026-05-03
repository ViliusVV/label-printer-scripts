import { Module } from "@nestjs/common";
import { GENERAL_DB_FILE } from "../config";
import { BookmarksController } from "./bookmarks.controller";
import { ContactsController } from "./contacts.controller";
import { GENERAL_DB_FILE_PATH } from "./general-db.constants";
import { GeneralDbService } from "./general-db.service";
import { NotesController } from "./notes.controller";

@Module({
  controllers: [NotesController, BookmarksController, ContactsController],
  providers: [{ provide: GENERAL_DB_FILE_PATH, useValue: GENERAL_DB_FILE }, GeneralDbService],
  exports: [GeneralDbService],
})
export class GeneralDbModule {}

