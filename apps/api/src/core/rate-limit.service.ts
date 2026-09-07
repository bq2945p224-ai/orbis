import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service.js";

@Injectable()
export class RateLimitService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowSeconds: number) {
    try {
      await this.redis.connect();
      const redisKey = `rl:${key}`;
      const count = await this.redis.client.incr(redisKey);
      if (count === 1) {
        await this.redis.client.expire(redisKey, windowSeconds);
      }
      if (count > limit) {
        throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
    }
  }
}
