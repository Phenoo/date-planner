import { z } from "zod";
import { encodeRecipe, decodeRecipe } from "@/lib/planner/money";
import { FieldValue } from "firebase-admin/firestore";
import { savedDocumentId } from "@/lib/firebase/paths";
import { authenticatedClient } from "@/lib/firebase/server";
import { savedRecipeSchema } from "@/lib/planner/saved";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { getCatalog } from "@/lib/planner/catalog";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { planHasQualifyingGoogleRatings } from "@/lib/server/plan-ratings";

import { dateSelectionId } from "@/lib/server/date-invitations";
import { recordFunnel } from "@/lib/server/funnel";

export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous")
      return Response.json(
        { error: "Please sign in to load your cloud plans." },
        { status: 401 },
      );
    const data = await auth.db
      .collection("users")
      .doc(auth.user.uid)
      .collection("savedPlans")
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();
    return Response.json({
      plans: data.docs.flatMap((row) => {
        const parsed = decodeRecipe(row.data().recipe);
        return parsed.success ? [parsed.data] : [];
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous")
      return Response.json(
        { error: "Please sign in to sync your plan." },
        { status: 401 },
      );
    const recipe = savedRecipeSchema.extend({ flowScope: z.uuid().optional() }).safeParse(await readJson(request));
    if (!recipe.success)
      return Response.json(
        { error: "Please save a valid plan." },
        { status: 400 },
      );
    const catalog = await getCatalog();
    const experiences = recipe.data.experienceIds.map((id) => catalog.find((item) => item.id === id));
    const plan = experiences.every((item) => item !== undefined) ? recalculateExactPlan(recipe.data.request, experiences, undefined, catalog) : null;
    if (!plan || !await planHasQualifyingGoogleRatings(plan)) throw new RequestError("Only places with a confirmed Google rating above 3.75 can be saved. Reopen your plan or choose another recommendation.", 409);
    const user = auth.db.collection("users").doc(auth.user.uid);
    const batch = auth.db.batch();
    batch.set(
      user,
      { updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.set(
      user.collection("savedPlans").doc(savedDocumentId(recipe.data.id)),
      {
        recipe: encodeRecipe(savedRecipeSchema.parse(recipe.data)),
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
    await batch.commit();
    await recordFunnel(auth.user.uid, "plan_saved", dateSelectionId("catalog", recipe.data.id), undefined, recipe.data.flowScope);
    return Response.json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous")
      return Response.json(
        { error: "Please sign in to remove this plan." },
        { status: 401 },
      );
    const parsed = savedRecipeSchema
      .pick({ id: true })
      .safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json({ error: "Invalid plan." }, { status: 400 });
    await auth.db
      .collection("users")
      .doc(auth.user.uid)
      .collection("savedPlans")
      .doc(savedDocumentId(parsed.data.id))
      .delete();
    return Response.json({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
