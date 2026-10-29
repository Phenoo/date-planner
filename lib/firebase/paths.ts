import { createHash } from "node:crypto";

// Recipe IDs can contain slashes and exceed Firestore's document ID limit.
export const savedDocumentId = (id: string) =>
  createHash("sha256").update(id).digest("hex");
