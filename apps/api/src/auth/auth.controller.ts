import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  verifyEmailSchema,
} from "@orbis/contracts";
import { AuthService, SESSION_COOKIE } from "./auth.service.js";
import { RateLimitService } from "../core/rate-limit.service.js";
import { AuthGuard, CurrentAccount, type AuthedAccount } from "./auth.guard.js";

function clientIp(req: Request) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0]?.trim();
  return req.ip;
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  @Post("register")
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = clientIp(req);
    await this.rateLimit.hit(`register:${ip}`, 10, 60 * 60);
    const input = registerSchema.parse(body);
    const result = await this.auth.register(input, {
      ip,
      userAgent: req.headers["user-agent"],
    });
    res.cookie(SESSION_COOKIE, result.token, this.auth.cookieOptions());
    return {
      account: result.account,
      character: result.character,
      expiresAt: result.expiresAt,
    };
  }

  @Post("verify-email")
  async verifyEmail(@Body() body: unknown, @Req() req: Request) {
    const input = verifyEmailSchema.parse(body);
    return this.auth.verifyEmail(input.token, clientIp(req));
  }

  @Post("login")
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ip = clientIp(req);
    await this.rateLimit.hit(`login:${ip}`, 30, 60 * 15);
    const input = loginSchema.parse(body);
    const result = await this.auth.login(input, {
      ip,
      userAgent: req.headers["user-agent"],
    });
    res.cookie(SESSION_COOKIE, result.token, this.auth.cookieOptions());
    return { account: result.account, expiresAt: result.expiresAt };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    await this.auth.logout(token, clientIp(req));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Post("revoke-sessions")
  async revokeSessions(@CurrentAccount() account: AuthedAccount, @Req() req: Request) {
    return this.auth.revokeAllSessions(account.id, clientIp(req));
  }

  @Post("password-reset/request")
  async requestReset(@Body() body: unknown, @Req() req: Request) {
    const ip = clientIp(req);
    await this.rateLimit.hit(`pwreset:${ip}`, 10, 60 * 60);
    const input = passwordResetRequestSchema.parse(body);
    return this.auth.requestPasswordReset(input.email, ip);
  }

  @Post("password-reset/confirm")
  async confirmReset(@Body() body: unknown, @Req() req: Request) {
    const input = passwordResetConfirmSchema.parse(body);
    return this.auth.confirmPasswordReset(input.token, input.password, clientIp(req));
  }

  @Get("me")
  async me(@Req() req: Request) {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException("Not authenticated");
    const { account } = await this.auth.resolveSession(token);
    return {
      id: account.id,
      email: account.email,
      username: account.username,
      emailVerified: Boolean(account.emailVerifiedAt),
    };
  }
}
