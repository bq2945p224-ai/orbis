import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { cities, countries, districts, regions, eq, sql } from "@orbis/db";
import {
  cellPolygonRing,
  enumerateCellsInBbox,
  cellAreaM2,
  baseCellPriceCents,
  cellCentroid,
} from "@orbis/contracts";
import { DbService } from "../core/db.service.js";

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

@Injectable()
export class MapService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async listCountries() {
    return this.dbService.db.select().from(countries);
  }

  async getLocation(districtId: string) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        districtId: districts.id,
        districtName: districts.name,
        cityId: cities.id,
        cityName: cities.name,
        cityLat: cities.latitude,
        cityLng: cities.longitude,
        regionId: regions.id,
        regionName: regions.name,
        countryId: countries.id,
        countryName: countries.name,
        countryCode: countries.code,
      })
      .from(districts)
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .innerJoin(regions, eq(cities.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id))
      .where(eq(districts.id, districtId))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException("Location not found");
    return row;
  }

  async parcelsInBbox(input: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    limit: number;
  }) {
    const result = await this.dbService.db.execute(sql`
      SELECT
        id,
        district_id as "districtId",
        city_id as "cityId",
        area_m2 as "areaM2",
        land_type as "landType",
        zoning,
        label,
        grid_ix as "gridIx",
        grid_iy as "gridIy",
        ST_AsGeoJSON(geom)::json as geometry
      FROM land_parcels
      WHERE geom && ST_MakeEnvelope(
        ${input.minLng}, ${input.minLat}, ${input.maxLng}, ${input.maxLat}, 4326
      )
      LIMIT ${input.limit}
    `);
    return asRows(result);
  }

  async getParcel(id: string) {
    const result = await this.dbService.db.execute(sql`
      SELECT
        id,
        district_id as "districtId",
        city_id as "cityId",
        region_id as "regionId",
        country_id as "countryId",
        area_m2 as "areaM2",
        land_type as "landType",
        zoning,
        label,
        grid_ix as "gridIx",
        grid_iy as "gridIy",
        ST_AsGeoJSON(geom)::json as geometry
      FROM land_parcels
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const row = asRows(result)[0];
    if (!row) throw new NotFoundException("Parcel not found");
    return row;
  }

  async listPlaces() {
    return this.dbService.db
      .select({
        id: cities.id,
        name: cities.name,
        latitude: cities.latitude,
        longitude: cities.longitude,
        regionName: regions.name,
        countryName: countries.name,
        countryCode: countries.code,
      })
      .from(cities)
      .innerJoin(regions, eq(cities.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id));
  }

  async searchLocations(q: string) {
    const query = `%${q.trim()}%`;
    const cityHits = await this.dbService.db
      .select({
        type: sql<string>`'city'`,
        id: cities.id,
        name: cities.name,
        latitude: cities.latitude,
        longitude: cities.longitude,
      })
      .from(cities)
      .where(sql`${cities.name} ILIKE ${query}`)
      .limit(10);

    const districtHits = await this.dbService.db
      .select({
        type: sql<string>`'district'`,
        id: districts.id,
        name: districts.name,
        latitude: cities.latitude,
        longitude: cities.longitude,
      })
      .from(districts)
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .where(sql`${districts.name} ILIKE ${query}`)
      .limit(10);

    return [...cityHits, ...districtHits];
  }

  async listResourceTypes() {
    const result = await this.dbService.db.execute(sql`
      SELECT key, name, unit, description, heatmap_color as "heatmapColor"
      FROM resource_definitions
      ORDER BY name
    `);
    return asRows(result);
  }

  /** Heatmap points for resource deposits in a bbox. */
  async resourcesInBbox(input: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    resource?: string;
    limit: number;
  }) {
    const result = await this.dbService.db.execute(sql`
      SELECT
        rd.id,
        rd.resource_key as "resourceKey",
        def.name as "resourceName",
        def.unit as unit,
        def.heatmap_color as "heatmapColor",
        rd.richness::float8 as richness,
        rd.radius_m as "radiusM",
        rd.remaining_units as "remainingUnits",
        rd.label as label,
        ST_Y(rd.geom)::float8 as latitude,
        ST_X(rd.geom)::float8 as longitude,
        ST_AsGeoJSON(rd.geom)::json as geometry
      FROM resource_deposits rd
      INNER JOIN resource_definitions def ON def.key = rd.resource_key
      WHERE rd.geom && ST_MakeEnvelope(
        ${input.minLng}, ${input.minLat}, ${input.maxLng}, ${input.maxLat}, 4326
      )
      ${input.resource ? sql`AND rd.resource_key = ${input.resource}` : sql``}
      ORDER BY rd.richness DESC
      LIMIT ${input.limit}
    `);
    return asRows(result);
  }

  /**
   * Claimable World Government grid for the viewport at a given cell size (1–1000 m).
   * Returns empty when zoomed out too far (too many cells).
   */
  async gridInBbox(input: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    cellSizeM: number;
    limit: number;
  }) {
    const cellSizeM = input.cellSizeM;
    const areaM2 = cellAreaM2(cellSizeM);
    const cells = enumerateCellsInBbox(
      input.minLng,
      input.minLat,
      input.maxLng,
      input.maxLat,
      cellSizeM,
      input.limit,
    );

    if (cells.length === 0) {
      return {
        cellSizeM,
        areaM2,
        zoomIn: true,
        features: [],
      };
    }

    const owned = await this.dbService.db.execute(sql`
      SELECT
        grid_ix as "gridIx",
        grid_iy as "gridIy",
        grid_size_m as "gridSizeM",
        id as "parcelId",
        (
          SELECT owner_character_id FROM parcel_ownerships po
          WHERE po.parcel_id = land_parcels.id
          LIMIT 1
        ) as "ownerCharacterId"
      FROM land_parcels
      WHERE grid_size_m = ${cellSizeM}
        AND (grid_ix, grid_iy) IN (${sql.join(
          cells.map((c) => sql`(${c.ix}, ${c.iy})`),
          sql`, `,
        )})
    `);
    const ownedRows = asRows<{
      gridIx: number;
      gridIy: number;
      gridSizeM: number;
      parcelId: string;
      ownerCharacterId: string | null;
    }>(owned);
    const ownedMap = new Map(ownedRows.map((r) => [`${r.gridIx}:${r.gridIy}`, r] as const));

    const features = cells.map(({ ix, iy }) => {
      const ring = cellPolygonRing(ix, iy, cellSizeM);
      const centroid = cellCentroid(ix, iy, cellSizeM);
      const hit = ownedMap.get(`${ix}:${iy}`);
      const status = hit?.ownerCharacterId ? "owned" : "available";
      return {
        type: "Feature" as const,
        properties: {
          ix,
          iy,
          areaM2,
          cellSizeM,
          status,
          parcelId: hit?.parcelId ?? null,
          priceCents: status === "available" ? baseCellPriceCents(areaM2, 0) : null,
          latitude: centroid.lat,
          longitude: centroid.lng,
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [ring],
        },
      };
    });

    return {
      cellSizeM,
      areaM2,
      zoomIn: false,
      features,
    };
  }
}
