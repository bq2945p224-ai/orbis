import { Module } from "@nestjs/common";
import { EconomyModule } from "../economy/economy.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [EconomyModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
