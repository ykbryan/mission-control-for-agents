"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseRouters, stringifyRouters, RouterConfig } from "@/lib/router-config";

export async function addRouter(config: RouterConfig) {
  const cookieStore = await cookies();
  const existing = parseRouters(cookieStore.get("routers")?.value);
  const updated = [...existing.filter(r => r.id !== config.id), config];
  cookieStore.set("routers", stringifyRouters(updated), { path: "/", expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
}

export async function removeRouter(id: string) {
  const cookieStore = await cookies();
  const existing = parseRouters(cookieStore.get("routers")?.value);
  const updated = existing.filter(r => r.id !== id);
  if (updated.length === 0) {
    cookieStore.delete("routers");
    redirect("/login");
  } else {
    cookieStore.set("routers", stringifyRouters(updated), { path: "/", expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("routers");
  // Also clear legacy single-router cookies
  cookieStore.delete("routerUrl");
  cookieStore.delete("routerToken");
  redirect("/login");
}
