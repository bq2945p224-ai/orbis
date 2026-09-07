import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { WorldService } from "./world.service.js";

@Controller("world")
@UseGuards(AuthGuard)
export class WorldController {
  constructor(
    @Inject(WorldService) private readonly world: WorldService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("treaties")
  async listTreaties(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listTreaties(account);
  }

  @Get("sanctions")
  async listSanctions(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listSanctions(account);
  }

  @Get("military")
  async listMilitary(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listMilitary(account);
  }

  @Get("wars")
  async listWars(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listWars(account);
  }

  @Get("environment")
  async getEnvironment(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.getEnvironment(account);
  }

  @Get("crimes")
  async listCrimes(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listCrimes(account);
  }

  @Post("crimes")
  async reportCrime(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.world.reportCrime(account, body);
  }

  @Get("courts")
  async listCourts(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listCourts(account);
  }

  @Get("npcs")
  async listNpcs(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listNpcs(account);
  }

  @Get("pathogens")
  async listPathogens(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.world.listPathogens(account);
  }
}
