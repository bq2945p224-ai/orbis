import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { CompaniesService } from "./companies.service.js";

@Controller("companies")
@UseGuards(AuthGuard)
export class CompaniesController {
  constructor(
    @Inject(CompaniesService) private readonly companies: CompaniesService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post()
  async create(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.companies.create(account, body);
  }

  @Get()
  async list(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.companies.list(account);
  }

  @Get("mine")
  async mine(@CurrentAccount() account: AuthedAccount) {
    this.auth.requireVerified(account);
    return this.companies.mine(account);
  }

  @Get(":id/talent")
  async talent(@CurrentAccount() account: AuthedAccount, @Param("id") id: string) {
    this.auth.requireVerified(account);
    return this.companies.listTalent(account, id);
  }

  @Get(":id")
  async getById(@CurrentAccount() account: AuthedAccount, @Param("id") id: string) {
    this.auth.requireVerified(account);
    return this.companies.getById(id);
  }

  @Post("hire")
  async hire(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.companies.hire(account, body);
  }

  @Post("produce")
  async produce(@CurrentAccount() account: AuthedAccount, @Body() body: unknown) {
    this.auth.requireVerified(account);
    return this.companies.produce(account, body);
  }

  @Post(":id/resign-employee")
  async resignEmployee(
    @CurrentAccount() account: AuthedAccount,
    @Param("id") id: string,
  ) {
    this.auth.requireVerified(account);
    return this.companies.resignEmployee(account, id);
  }
}
