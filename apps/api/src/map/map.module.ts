import { Module } from "@nestjs/common";
import { MapController } from "./map.controller.js";
import { MapService } from "./map.service.js";

@Module({
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
