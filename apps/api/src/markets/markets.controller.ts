import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { MarketsService } from "./markets.service.js";

@Controller("markets")
@UseGuards(AuthGuard)
export class MarketsController {
  constructor(
    @Inject(MarketsService) private readonly markets: MarketsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("listings")
  async listListings(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.markets.listListings(account);
  }

  @Post("listings")
  async createListing(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.markets.createListing(account, body);
  }

  @Post("buy")
  async buy(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.markets.buy(account, body);
  }

  @Post("loans")
  async requestLoan(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.markets.requestLoan(account, body);
  }

  @Get("loans/mine")
  async myLoans(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.markets.myLoans(account);
  }
}
