import { encodeRecipe, decodeRecipe } from "@/lib/planner/money";
import { FieldValue } from "firebase-admin/firestore";
import { savedDocumentId } from "@/lib/firebase/paths";
import { authenticatedClient } from "@/lib/firebase/server";
import { savedRecipeSchema } from "@/lib/planner/saved";
import { apiError, readJson } from "@/lib/planner/http";

export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth)
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
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth)
      return Response.json(
        { error: "Please sign in to sync your plan." },
        { status: 401 },
      );
    const recipe = savedRecipeSchema.safeParse(await readJson(request));
    if (!recipe.success)
      return Response.json(
        { error: "Please save a valid plan." },
        { status: 400 },
      );
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
        recipe: encodeRecipe(recipe.data),
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
    await batch.commit();
    return Response.json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth)
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
