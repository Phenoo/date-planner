import { z } from "zod";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { authenticatedClient } from "@/lib/firebase/server";
import { apiError, readJson } from "@/lib/planner/http";
import { requestSchema } from "@/lib/planner/schema";
import { plannerQuestionCount } from "@/lib/planner/questions";
import { toKobo, decodePlanRequest } from "@/lib/planner/money";
const schema=z.object({request:requestSchema,step:z.number().int().min(0).max(plannerQuestionCount-1),version:z.number().int()});
export async function GET(request: Request){try{const auth=await authenticatedClient(request);if(!auth)return Response.json({error:"Session required."},{status:401});const doc=await auth.db.collection("users").doc(auth.user.uid).collection("planningSessions").doc("active").get();const data=doc.data();const parsed=decodePlanRequest(data);return Response.json({draft:parsed.success?{request:parsed.data,step:data?.step,version:data?.version}:null},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiError(error);}}
export async function PUT(request: Request){try{const auth=await authenticatedClient(request);if(!auth)return Response.json({error:"Session required."},{status:401});const input=schema.safeParse(await readJson(request));if(!input.success)return Response.json({error:"Invalid planning session."},{status:400});await auth.db.collection("users").doc(auth.user.uid).collection("planningSessions").doc("active").set({...input.data,moneyUnit:"NGN_KOBO",request:{...input.data.request,budget:input.data.request.budget===null?null:toKobo(input.data.request.budget)},updatedAt:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+30*86400000)});return Response.json({saved:true});}catch(error){return apiError(error);}}
