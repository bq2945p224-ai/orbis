import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { HealthcareService } from "./healthcare.service.js";

@Controller("healthcare")
@UseGuards(AuthGuard)
export class HealthcareController {
  constructor(
    @Inject(HealthcareService) private readonly healthcare: HealthcareService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("me")
  async getMe(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.healthcare.getMe(account);
  }

  @Post("treat")
  async treat(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.healthcare.treat(account, body);
  }

  @Post("consume")
  async consume(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.healthcare.consume(account, body);
  }

  @Post("buy-supplies")
  async buySupplies(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.healthcare.buySupplies(account, body);
  }

  @Post("forage")
  async forage(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.healthcare.forage(account, body);
  }
}
