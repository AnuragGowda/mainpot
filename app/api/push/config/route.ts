import { getPublicPushConfig } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getPublicPushConfig(), {
    headers: { "cache-control": "private, no-store" },
  });
}
