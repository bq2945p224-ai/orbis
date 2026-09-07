import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "../auth/auth.guard.js";
import { CharacterService } from "./character.service.js";

@Controller("character")
export class CharacterController {
  constructor(@Inject(CharacterService) private readonly characters: CharacterService) {}

  @UseGuards(AuthGuard)
  @Get("me")
  async me(@CurrentAccount() account: AuthedAccount) {
    return this.characters.getMe(account);
  }

  @Get(":id")
  async byId(@Param("id") id: string) {
    return this.characters.getById(id);
  }
}
