import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CharacterController } from "./character.controller.js";
import { CharacterService } from "./character.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CharacterController],
  providers: [CharacterService],
  exports: [CharacterService],
})
export class CharacterModule {}
