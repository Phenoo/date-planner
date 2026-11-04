import { encodeExperience, decodeExperience } from "@/lib/planner/money";
import { catalogReviewIssues, catalogCoverage } from "@/lib/planner/catalog-review";
import { toMinorUnits } from "@/lib/planner/currency";
import { FieldValue } from "firebase-admin/firestore";
import { authenticatedClient } from "@/lib/firebase/server";
import { experienceSchema } from "@/lib/planner/schema";
import { apiError, readJson } from "@/lib/planner/http";

export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true)
      return Response.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    const data = await auth.db.collection("experiences").limit(1000).get();
    const experiences = data.docs.flatMap((doc) => { const record = decodeExperience(doc.data().record); return record.success ? [record.data] : []; });
    return Response.json({ experiences, coverage: catalogCoverage(experiences), reviews: experiences.flatMap(record => { const issues = catalogReviewIssues(record); return issues.length ? [{ id: record.id, venue: record.venue, issues }] : []; }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true)
      return Response.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    const parsed = experienceSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json(
        {
          error: "Please check the experience fields.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    const experience = parsed.data;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(experience.id))
      return Response.json(
        {
          error:
            "Use a short experience ID with letters, digits, dashes, or underscores.",
        },
        { status: 400 },
      );
    const reviewIssues = catalogReviewIssues(experience);
    if (reviewIssues.length) return Response.json({ error: reviewIssues.join(" ") }, { status: 400 });
    if (!experience.hours.every((hours) => hours.close > hours.open))
      return Response.json(
        { error: "Closing times must follow opening times." },
        { status: 400 },
      );
    const ref = auth.db.collection("experiences").doc(experience.id);
    await auth.db.runTransaction(async (transaction) => {
      const previous = await transaction.get(ref);
      transaction.set(ref, {
        record: encodeExperience(experience),
        active: experience.active,
        approved: experience.approved,
        demo: experience.demo,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.user.uid,
      });
      const decoded = decodeExperience(previous.data()?.record);
      const before = decoded.success ? decoded.data : null;
      if (
        !before ||
        before.price !== experience.price ||
        before.priceType !== experience.priceType || before.currency !== experience.currency
      )
        transaction.set(ref.collection("priceHistory").doc(), {
          priceMinorUnits: toMinorUnits(experience.price, experience.currency),
          ...(experience.currency === "NGN" ? { priceKobo: toMinorUnits(experience.price, "NGN") } : {}),
          priceType: experience.priceType,
          currency: experience.currency,
          verifiedAt: experience.verifiedAt,
          sourceUrl: experience.sourceUrl,
          changedAt: FieldValue.serverTimestamp(),
          changedBy: auth.user.uid,
        });
    });
    return Response.json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
