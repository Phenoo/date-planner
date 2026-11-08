import { membershipWebhook } from "@/lib/server/membership-webhooks";
export const POST = (request: Request) => membershipWebhook(request, "polar");
