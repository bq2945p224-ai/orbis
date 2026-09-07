import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { PropertyService } from "./property.service.js";

@Controller("property")
@UseGuards(AuthGuard)
export class PropertyController {
  constructor(
    @Inject(PropertyService) private readonly property: PropertyService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("listings")
  async listings(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.property.listListings(account);
  }

  @Post("buy")
  async buy(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.property.buy(account, body);
  }

  @Post("buy-cell")
  async buyCell(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.property.buyCell(account, body);
  }

  @Post("preview-cell")
  async previewCell(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.property.previewCell(account, body);
  }

  @Post("list")
  async list(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.property.list(account, body);
  }

  @Get("mine")
  async mine(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.property.mine(account);
  }

  @Post("build")
  async build(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.property.build(account, body);
  }

  @Post("build-quote")
  async buildQuote(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.property.buildQuote(account, body);
  }

  @Get("building-types")
  async buildingTypes(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.property.buildingCatalog();
  }
}
