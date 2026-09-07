import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("organizations")
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService) private readonly organizations: OrganizationsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post()
  async create(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.organizations.create(account, body);
  }

  @Get()
  async list(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.organizations.list(account);
  }

  @Post("join")
  async join(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.organizations.join(account, body);
  }

  @Post("leave")
  async leave(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.organizations.leave(account, body);
  }
}
