import { Injectable } from "@nestjs/common";
import { loadEnv, type OrbisEnv } from "@orbis/config";

@Injectable()
export class ConfigService {
  readonly env: OrbisEnv = loadEnv();
}
