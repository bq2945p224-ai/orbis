import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { mapBboxSchema, mapGridSchema, mapResourcesSchema } from "@orbis/contracts";
import { z } from "zod";
import { MapService } from "./map.service.js";

@Controller("map")
export class MapController {
  constructor(@Inject(MapService) private readonly map: MapService) {}

  @Get("countries")
  countries() {
    return this.map.listCountries();
  }

  @Get("location/:id")
  location(@Param("id") id: string) {
    return this.map.getLocation(id);
  }

  @Get("parcels")
  parcels(@Query() query: Record<string, string>) {
    const input = mapBboxSchema.parse(query);
    return this.map.parcelsInBbox(input);
  }

  @Get("parcels/:id")
  parcel(@Param("id") id: string) {
    return this.map.getParcel(id);
  }

  @Get("places")
  places() {
    return this.map.listPlaces();
  }

  @Get("search")
  search(@Query("q") q: string) {
    const query = z.string().min(1).max(100).parse(q);
    return this.map.searchLocations(query);
  }

  @Get("resources/types")
  resourceTypes() {
    return this.map.listResourceTypes();
  }

  @Get("resources")
  resources(@Query() query: Record<string, string>) {
    const input = mapResourcesSchema.parse(query);
    return this.map.resourcesInBbox(input);
  }

  @Get("grid")
  grid(@Query() query: Record<string, string>) {
    const input = mapGridSchema.parse(query);
    return this.map.gridInBbox(input);
  }
}
