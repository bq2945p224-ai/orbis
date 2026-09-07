import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { IdentityService } from "./identity.service.js";

@Controller("identity")
@UseGuards(AuthGuard)
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("me")
  async me(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.identity.getMe(account);
  }

  @Post("citizenship/apply")
  async apply(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.identity.applyCitizenship(account, body);
  }
}
