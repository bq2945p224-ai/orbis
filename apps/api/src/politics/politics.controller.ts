import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { PoliticsService } from "./politics.service.js";

@Controller("politics")
@UseGuards(AuthGuard)
export class PoliticsController {
  constructor(
    @Inject(PoliticsService) private readonly politics: PoliticsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("parties")
  async listParties(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.politics.listParties(account);
  }

  @Post("parties")
  async createParty(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.politics.createParty(account, body);
  }

  @Post("parties/join")
  async joinParty(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.politics.joinParty(account, body);
  }

  @Get("elections")
  async listElections(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.politics.listElections(account);
  }

  @Post("candidacy")
  async declareCandidacy(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.politics.declareCandidacy(account, body);
  }

  @Post("vote")
  async vote(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.politics.vote(account, body);
  }

  @Get("offices")
  async listOffices(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.politics.listOffices(account);
  }

  @Get("laws")
  async listLaws(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.politics.listLaws(account);
  }

  @Post("laws")
  async enactLaw(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.politics.enactLaw(account, body);
  }
}
