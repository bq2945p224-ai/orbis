import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  characterBlocks,
  characterProfiles,
  channelMembers,
  channels,
  characters,
  messages,
  notifications,
  and,
  desc,
  eq,
  inArray,
  isNull,
} from "@orbis/db";
import { dmSchema, updateProfileSchema, WorldEventType } from "@orbis/contracts";
import { z } from "zod";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

const blockSchema = z.object({
  blockedCharacterId: z.string().uuid(),
});

const readNotificationsSchema = z.object({
  notificationIds: z.array(z.string().uuid()).optional(),
});

function dmChannelName(a: string, b: string) {
  return [a, b].sort().join(":");
}

@Injectable()
export class SocialService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  async getProfile(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [profile] = await db
      .select()
      .from(characterProfiles)
      .where(eq(characterProfiles.characterId, character.id))
      .limit(1);

    return {
      characterId: character.id,
      name: character.name,
      bio: profile?.bio ?? "",
      updatedAt: profile?.updatedAt ?? null,
    };
  }

  async updateProfile(account: AuthedAccount, body: unknown) {
    const input = updateProfileSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [profile] = await db
      .insert(characterProfiles)
      .values({ characterId: character.id, bio: input.bio })
      .onConflictDoUpdate({
        target: characterProfiles.characterId,
        set: { bio: input.bio, updatedAt: new Date() },
      })
      .returning();

    return {
      characterId: character.id,
      bio: profile!.bio,
      updatedAt: profile!.updatedAt,
    };
  }

  async sendDm(account: AuthedAccount, body: unknown) {
    const input = dmSchema.parse(body);
    const db = this.dbService.db;
    const sender = await requireLivingCharacter(db, account);

    if (sender.id === input.toCharacterId) {
      throw new BadRequestException("Cannot message yourself");
    }

    const [recipient] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, input.toCharacterId), eq(characters.status, "alive")))
      .limit(1);
    if (!recipient) throw new NotFoundException("Recipient not found");

    const [blocked] = await db
      .select()
      .from(characterBlocks)
      .where(
        and(
          eq(characterBlocks.blockerCharacterId, input.toCharacterId),
          eq(characterBlocks.blockedCharacterId, sender.id),
        ),
      )
      .limit(1);
    if (blocked) throw new BadRequestException("Cannot message this character");

    const channelName = dmChannelName(sender.id, input.toCharacterId);

    let channelId: string;
    const [existingChannel] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.kind, "dm"), eq(channels.name, channelName)))
      .limit(1);

    if (existingChannel) {
      channelId = existingChannel.id;
    } else {
      const [channel] = await db
        .insert(channels)
        .values({ kind: "dm", name: channelName })
        .returning();
      if (!channel) throw new BadRequestException("Could not create channel");
      channelId = channel.id;

      await db.insert(channelMembers).values([
        { channelId, characterId: sender.id },
        { channelId, characterId: input.toCharacterId },
      ]);
    }

    const [message] = await db
      .insert(messages)
      .values({
        channelId,
        senderCharacterId: sender.id,
        body: input.body,
      })
      .returning();

    if (!message) throw new BadRequestException("Could not send message");

    await db.insert(notifications).values({
      characterId: input.toCharacterId,
      type: "dm",
      body: `${sender.name}: ${input.body.slice(0, 120)}`,
    });

    await this.events.emit({
      type: WorldEventType.MessageSent,
      payload: {
        channelId,
        messageId: message.id,
        toCharacterId: input.toCharacterId,
      },
      actorCharacterId: sender.id,
      subjectType: "message",
      subjectId: message.id,
    });

    return {
      messageId: message.id,
      channelId,
      createdAt: message.createdAt,
    };
  }

  async inbox(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const memberships = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.characterId, character.id));

    const channelIds = memberships.map((m) => m.channelId);
    if (channelIds.length === 0) return { channels: [] };

    const channelRows = await db
      .select()
      .from(channels)
      .where(inArray(channels.id, channelIds));

    const result = [];
    for (const channel of channelRows) {
      const [lastMessage] = await db
        .select()
        .from(messages)
        .where(eq(messages.channelId, channel.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      result.push({
        channelId: channel.id,
        kind: channel.kind,
        name: channel.name,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              senderCharacterId: lastMessage.senderCharacterId,
              body: lastMessage.body,
              createdAt: lastMessage.createdAt,
            }
          : null,
      });
    }

    result.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() ?? 0;
      const bTime = b.lastMessage?.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    return { channels: result };
  }

  async getChannelMessages(account: AuthedAccount, channelId: string) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(
        and(eq(channelMembers.channelId, channelId), eq(channelMembers.characterId, character.id)),
      )
      .limit(1);
    if (!membership) throw new NotFoundException("Channel not found");

    const rows = await db
      .select({
        id: messages.id,
        senderCharacterId: messages.senderCharacterId,
        senderName: characters.name,
        body: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(characters, eq(messages.senderCharacterId, characters.id))
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.createdAt))
      .limit(100);

    return { channelId, messages: rows.reverse() };
  }

  async listNotifications(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.characterId, character.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return { notifications: rows };
  }

  async markNotificationsRead(account: AuthedAccount, body: unknown) {
    const input = readNotificationsSchema.parse(body ?? {});
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const now = new Date();
    if (input.notificationIds && input.notificationIds.length > 0) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.characterId, character.id),
            inArray(notifications.id, input.notificationIds),
            isNull(notifications.readAt),
          ),
        );
    } else {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.characterId, character.id), isNull(notifications.readAt)));
    }

    return { ok: true };
  }

  async block(account: AuthedAccount, body: unknown) {
    const input = blockSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    if (character.id === input.blockedCharacterId) {
      throw new BadRequestException("Cannot block yourself");
    }

    const [target] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, input.blockedCharacterId))
      .limit(1);
    if (!target) throw new NotFoundException("Character not found");

    await db
      .insert(characterBlocks)
      .values({
        blockerCharacterId: character.id,
        blockedCharacterId: input.blockedCharacterId,
      })
      .onConflictDoNothing();

    return { blockedCharacterId: input.blockedCharacterId };
  }
}
