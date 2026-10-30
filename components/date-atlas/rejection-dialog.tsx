"use client";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useState } from "react";
export type RejectionReason = "place" | "distance" | "activity";
export function RejectionDialog({ open, onOpenChange, onConfirm, radius }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: RejectionReason) => void; radius: number }) {
  const [reason, setReason] = useState<RejectionReason>("place");
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>What should we change?</AlertDialogTitle><AlertDialogDescription>We&apos;ll keep your other answers and exclude this place.</AlertDialogDescription></AlertDialogHeader><label className="field"><span>Find something that feels better</span><select value={reason} onChange={(event) => { const value = event.target.value; if (value === "place" || value === "distance" || value === "activity") setReason(value); }}><option value="place">Just a different place</option><option value="distance">Closer — within {radius} km</option><option value="activity">A different activity type</option></select></label><AlertDialogFooter><AlertDialogCancel>Keep this pick</AlertDialogCancel><AlertDialogAction onClick={() => onConfirm(reason)}>Replace</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
