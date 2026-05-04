import type { InputsController } from "../inputs/inputs.controller";

export function createAppRouter(inputs: InputsController) {
  return {
    inputs: {
      list: inputs.list,
      add: inputs.add,
      delete: inputs.delete,
      clear: inputs.clear,
      sync: {
        download: inputs.syncDownload,
        upload: inputs.syncUpload,
      },
    },
  };
}

export type AppRouter = ReturnType<typeof createAppRouter>;
