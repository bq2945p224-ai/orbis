import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { CharacterModule } from "./character/character.module.js";
import { MapModule } from "./map/map.module.js";
import { EconomyModule } from "./economy/economy.module.js";
import { SkillsModule } from "./skills/skills.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { TravelModule } from "./travel/travel.module.js";
import { PropertyModule } from "./property/property.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { CompaniesModule } from "./companies/companies.module.js";
import { SocialModule } from "./social/social.module.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { PoliticsModule } from "./politics/politics.module.js";
import { MarketsModule } from "./markets/markets.module.js";
import { HealthcareModule } from "./healthcare/healthcare.module.js";
import { WorldModule } from "./world/world.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { HealthController } from "./health.controller.js";
import { CoreModule } from "./core/core.module.js";
import { IdentityModule } from "./identity/identity.module.js";

@Module({
  imports: [
    CoreModule,
    AuthModule,
    CharacterModule,
    IdentityModule,
    MapModule,
    EconomyModule,
    SkillsModule,
    JobsModule,
    TravelModule,
    PropertyModule,
    AssetsModule,
    CompaniesModule,
    SocialModule,
    OrganizationsModule,
    PoliticsModule,
    MarketsModule,
    HealthcareModule,
    WorldModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
