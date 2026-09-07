import { Body, Controller, Headers, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminService } from "./admin.service.js";

@Controller("admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Post("grant-money")
  async grantMoney(
    @Body() body: unknown,
    @Headers("x-admin-secret") headerSecret: string | undefined,
    @Req() req: Request,
  ) {
    const bodySecret =
      body && typeof body === "object" && "adminSecret" in body
        ? String((body as { adminSecret?: unknown }).adminSecret ?? "")
        : undefined;
    const secret = headerSecret || bodySecret;
    const ip =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
        : undefined) || req.ip;
    return this.admin.grantMoney(body, secret, ip);
  }
}
