import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EconomyModule } from "../economy/economy.module.js";
import { MarketsController } from "./markets.controller.js";
import { MarketsService } from "./markets.service.js";

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [MarketsController],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MarketsModule {}
