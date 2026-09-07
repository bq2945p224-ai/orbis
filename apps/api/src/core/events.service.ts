import { Inject, Injectable } from "@nestjs/common";
import { outbox, worldClock, worldEvents, eq } from "@orbis/db";
import { DbService } from "./db.service.js";

@Injectable()
export class EventsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async emit(input: {
    type: string;
    payload?: Record<string, unknown>;
    actorCharacterId?: string | null;
    subjectType?: string | null;
    subjectId?: string | null;
  }) {
    const db = this.dbService.db;
    const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
    const simTime = clock?.simTime ?? new Date();

    const [event] = await db
      .insert(worldEvents)
      .values({
        type: input.type,
        payload: input.payload ?? {},
        actorCharacterId: input.actorCharacterId ?? null,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        simTime,
      })
      .returning();

    if (!event) throw new Error("failed to insert world event");

    await db.insert(outbox).values({ eventId: event.id });
    return event;
  }
}
