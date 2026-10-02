import { NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE, handlePreviewApi } from "@/lib/preview-handlers";
import { publicApiOrigin } from "@/lib/preview-guest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxyToOrigin(req: NextRequest, path: string[]) {
  const origin = publicApiOrigin();
  if (!origin) return null;

  const url = new URL(req.url);
  const target = `${origin}/api/${path.join("/")}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

async function handle(req: NextRequest, path: string[]) {
  try {
    const proxied = await proxyToOrigin(req, path);
    if (proxied) return proxied;
  } catch (error) {
    console.error("API_ORIGIN proxy failed; falling back to preview guest API", error);
  }

  let body: unknown = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  }

  const result = await handlePreviewApi(
    req.method,
    path.join("/"),
    body,
    req.nextUrl.searchParams,
  );

  const response = NextResponse.json(result.body, { status: result.status ?? 200 });
  if (result.clearGuest) {
    response.cookies.set(GUEST_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  }
  return response;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
