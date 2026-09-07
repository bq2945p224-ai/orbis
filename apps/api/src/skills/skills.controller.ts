import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { SkillsService } from "./skills.service.js";

@Controller("skills")
@UseGuards(AuthGuard)
export class SkillsController {
  constructor(
    @Inject(SkillsService) private readonly skills: SkillsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  async list(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.skills.listForAccount(account);
  }

  @Get("catalog")
  async catalog(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.skills.catalog(account);
  }

  @Post("focus")
  async focus(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.skills.focus(account, body);
  }

  @Post("buff")
  async buff(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.skills.activateBuff(account, body);
  }

  @Post("buff/clear")
  async clearBuff(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.skills.clearBuff(account);
  }
}
