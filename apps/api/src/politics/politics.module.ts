import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PoliticsController } from "./politics.controller.js";
import { PoliticsService } from "./politics.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PoliticsController],
  providers: [PoliticsService],
  exports: [PoliticsService],
})
export class PoliticsModule {}
