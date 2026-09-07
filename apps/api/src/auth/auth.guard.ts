import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, SESSION_COOKIE } from "./auth.service.js";

export type AuthedAccount = {
  id: string;
  email: string;
  username: string;
  emailVerifiedAt: Date | null;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request & { account?: AuthedAccount }>();
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException("Not authenticated");
    const { account } = await this.auth.resolveSession(token);
    req.account = {
      id: account.id,
      email: account.email,
      username: account.username,
      emailVerifiedAt: account.emailVerifiedAt,
    };
    return true;
  }
}

export const CurrentAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedAccount => {
    const req = ctx.switchToHttp().getRequest<Request & { account?: AuthedAccount }>();
    if (!req.account) throw new UnauthorizedException("Not authenticated");
    return req.account;
  },
);
