import { membershipManage } from "@/lib/server/membership-billing";
export const POST = (request: Request) => membershipManage(request, "cancel");
