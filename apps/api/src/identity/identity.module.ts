import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";

@Module({
  imports: [AuthModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
