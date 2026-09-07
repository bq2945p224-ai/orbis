import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "./config.service.js";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async send(to: string, subject: string, text: string) {
    const key = this.config.env.RESEND_API_KEY;
    if (!key) {
      this.logger.log(`[dev-email] to=${to} subject=${subject}\n${text}`);
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.env.EMAIL_FROM,
        to: [to],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend failed: ${res.status} ${body}`);
    }
  }
}
