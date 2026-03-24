import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("routerUrl");
  response.cookies.delete("routerToken");
  return response;
}
