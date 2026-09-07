import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EconomyModule } from "../economy/economy.module.js";
import { TravelController } from "./travel.controller.js";
import { TravelService } from "./travel.service.js";

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [TravelController],
  providers: [TravelService],
  exports: [TravelService],
})
export class TravelModule {}
