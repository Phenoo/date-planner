"use client";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useState } from "react";
export type RejectionReason = "place" | "distance" | "activity";
export function RejectionDialog({ open, onOpenChange, onConfirm, radius }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: RejectionReason) => void; radius: number }) {
  const [reason, setReason] = useState<RejectionReason>("place");
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Not quite your thing?</AlertDialogTitle><AlertDialogDescription>Tell us what feels off. We’ll look for another place and keep the rest of your answers.</AlertDialogDescription></AlertDialogHeader><label className="field"><span>What would feel better?</span><select value={reason} onChange={(event) => { const value = event.target.value; if (value === "place" || value === "distance" || value === "activity") setReason(value); }}><option value="place">Just a different place</option><option value="distance">Somewhere closer — within {radius} km</option><option value="activity">Something different to do</option></select></label><AlertDialogFooter><AlertDialogCancel>Keep this pick</AlertDialogCancel><AlertDialogAction onClick={() => onConfirm(reason)}>Find another place</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
