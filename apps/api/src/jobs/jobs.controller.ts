import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { JobsService } from "./jobs.service.js";

@Controller("jobs")
@UseGuards(AuthGuard)
export class JobsController {
  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  async list(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.jobs.listOpen(account);
  }

  @Get("mine")
  async mine(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.jobs.mine(account);
  }

  @Post("apply")
  async apply(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.jobs.apply(account, body);
  }

  @Post("resign")
  async resign(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.jobs.resign(account);
  }
}
