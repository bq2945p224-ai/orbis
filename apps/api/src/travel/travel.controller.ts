import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { TravelService } from "./travel.service.js";

@Controller("travel")
@UseGuards(AuthGuard)
export class TravelController {
  constructor(
    @Inject(TravelService) private readonly travel: TravelService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("status")
  async status(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.travel.status(account);
  }

  @Get("destinations")
  async destinations(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.travel.destinations(account);
  }

  @Get("addresses")
  async addresses(@CurrentAccount() account: AuthedAccount, @Query("q") q: string) {
    this.auth.requireVerified(account);
    const query = z.string().max(120).parse(q ?? "");
    return this.travel.searchAddresses(account, query);
  }

  @Post("quote")
  async quote(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.travel.quote(account, body);
  }

  @Post()
  async start(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.travel.start(account, body);
  }
}
