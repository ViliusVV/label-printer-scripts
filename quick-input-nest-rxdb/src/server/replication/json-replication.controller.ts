import { BadRequestException, Body, Controller, Param, Post } from "@nestjs/common";
import {
  jsonEntityKeySchema,
  jsonEntityPullResponseSchemas,
  jsonEntityPushBodySchemas,
  jsonPullBodySchema,
  okResponseSchema,
  type JsonPullResponse,
  type JsonEntityKey,
} from "../../shared/contracts";
import { JsonReplicationService } from "./json-replication.service";

@Controller("api/replication")
export class JsonReplicationController {
  constructor(private readonly replication: JsonReplicationService) {}

  @Post(":entity/pull")
  async pull(@Param("entity") entityParam: string, @Body() body: unknown): Promise<JsonPullResponse<JsonEntityKey>> {
    const entity = this.parseEntity(entityParam);
    const parsedBody = jsonPullBodySchema.safeParse(body ?? {});
    if (!parsedBody.success) {
      throw new BadRequestException(parsedBody.error.flatten());
    }
    const items = await this.replication.pull(entity);
    return jsonEntityPullResponseSchemas[entity].parse({ items }) as JsonPullResponse<JsonEntityKey>;
  }

  @Post(":entity/push")
  async push(@Param("entity") entityParam: string, @Body() body: unknown): Promise<{ ok: true }> {
    const entity = this.parseEntity(entityParam);
    const parsedBody = jsonEntityPushBodySchemas[entity].safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException(parsedBody.error.flatten());
    }

    await this.replication.push(entity, parsedBody.data.mutations as never);
    return okResponseSchema.parse({ ok: true });
  }

  private parseEntity(entityParam: string): JsonEntityKey {
    const parsed = jsonEntityKeySchema.safeParse(entityParam);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return parsed.data;
  }
}


