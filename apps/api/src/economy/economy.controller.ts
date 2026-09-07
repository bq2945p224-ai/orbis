import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { transferSchema } from "@orbis/contracts";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { EconomyService } from "./economy.service.js";

@Controller("economy")
@UseGuards(AuthGuard)
export class EconomyController {
  constructor(
    @Inject(EconomyService) private readonly economy: EconomyService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("wallet")
  async wallet(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.economy.getWallet(account);
  }

  @Post("transfer")
  async transfer(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    const input = transferSchema.parse(body);
    return this.economy.transfer(account, input);
  }
}
