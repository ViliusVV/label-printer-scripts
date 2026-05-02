import { Elysia } from "elysia";
import { InputController } from "./inputs.controller";
import { InputStorage } from "./inputs.storage";

export const createInputsPlugin = (storage: InputStorage) => {
  const controller = new InputController(storage);
  return new Elysia({ prefix: "/api/inputs" }).use(controller.routes);
};

