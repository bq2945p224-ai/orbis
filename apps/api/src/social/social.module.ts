import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { SocialController } from "./social.controller.js";
import { SocialService } from "./social.service.js";

@Module({
  imports: [AuthModule],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
