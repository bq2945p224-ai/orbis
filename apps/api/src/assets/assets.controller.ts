import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { AssetsService } from "./assets.service.js";

@Controller("assets")
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(
    @Inject(AssetsService) private readonly assets: AssetsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("portfolio")
  async portfolio(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.assets.portfolio(account);
  }

  @Get("market")
  async market(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.assets.listMarket(account);
  }

  @Post("buy")
  async buy(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.assets.buyListing(account, body);
  }
}
