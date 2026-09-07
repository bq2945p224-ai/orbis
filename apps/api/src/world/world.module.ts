import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { WorldController } from "./world.controller.js";
import { WorldService } from "./world.service.js";

@Module({
  imports: [AuthModule],
  controllers: [WorldController],
  providers: [WorldService],
  exports: [WorldService],
})
export class WorldModule {}
