import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EconomyModule } from "../economy/economy.module.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
