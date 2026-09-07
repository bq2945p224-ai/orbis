import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EconomyModule } from "../economy/economy.module.js";
import { PropertyController } from "./property.controller.js";
import { PropertyService } from "./property.service.js";

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [PropertyController],
  providers: [PropertyService],
  exports: [PropertyService],
})
export class PropertyModule {}
