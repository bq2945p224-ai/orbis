import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { SocialService } from "./social.service.js";

@Controller("social")
@UseGuards(AuthGuard)
export class SocialController {
  constructor(
    @Inject(SocialService) private readonly social: SocialService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("profile")
  async getProfile(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.social.getProfile(account);
  }

  @Patch("profile")
  async updateProfile(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.social.updateProfile(account, body);
  }

  @Post("dm")
  async sendDm(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.social.sendDm(account, body);
  }

  @Get("inbox")
  async inbox(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.social.inbox(account);
  }

  @Get("channels/:id/messages")
  async getChannelMessages(
    @CurrentAccount() account: AuthedAccount,
    @Param("id") id: string,
  ) {
    this.auth.requireVerified(account);
    return this.social.getChannelMessages(account, id);
  }

  @Get("notifications")
  async listNotifications(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.social.listNotifications(account);
  }

  @Post("notifications/read")
  async markNotificationsRead(
    @CurrentAccount() account: AuthedAccount,
    @Body() body: unknown,
  ) {
    this.auth.requireVerified(account);
    return this.social.markNotificationsRead(account, body);
  }

  @Post("block")
  async block(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.social.block(account, body);
  }
}
