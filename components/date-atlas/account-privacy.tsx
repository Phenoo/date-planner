"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { getBrowserAuth } from "@/lib/firebase/client";
import { plannerFetch, PlanningRequestError, readPlanningResponse } from "@/lib/firebase/planner-client";
import { AccountAccess } from "./account-access";
import { savedAccountKey } from "@/lib/planner/saved";
import { confirmedDeletionToken, DeletionSessionChangedError } from "@/lib/firebase/account-deletion-session";

const responseSchema = z.object({ status: z.enum(["none", "requested", "processing", "complete"]), automatic: z.boolean().default(false), processAfter: z.string().nullable().default(null), receipt: z.string().regex(/^[a-f0-9]{64}$/).optional() });
const receiptSchema = z.object({ uid: z.string(), receipt: z.string().regex(/^[a-f0-9]{64}$/) });
const receiptKey = "date-atlas:deletion-receipt";

export function AccountPrivacy() {
  const [status, setStatus] = useState<z.infer<typeof responseSchema>["status"]>("none");
  const [automatic, setAutomatic] = useState(false); const [processAfter, setProcessAfter] = useState<string | null>(null);
  const [open, setOpen] = useState(false); const [expanded, setExpanded] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(false); const [needsSignIn, setNeedsSignIn] = useState(false); const [reauthenticating, setReauthenticating] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const receipt = useRef<z.infer<typeof receiptSchema> | null>(null);
  const displayedOwner = useRef<string | null>(null); const confirmationOwner = useRef<string | null>(null); const completedOwner = useRef<string | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const auth = getBrowserAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, user => {
      if (!displayedOwner.current || displayedOwner.current === user?.uid) return;
      setAvailable(false);
      if (!user && completedOwner.current === displayedOwner.current) return;
      controller.current?.abort(); controller.current = null; confirmationOwner.current = null; displayedOwner.current = null; completedOwner.current = null; receipt.current = null;
      try { sessionStorage.removeItem(receiptKey); } catch { /* The in-memory receipt is no longer used. */ }
      setBusy(false); setOpen(false); setStatus("none"); setAutomatic(false); setProcessAfter(null); setNeedsSignIn(false); setReauthenticating(false);
      setMessage("Your account changed. Refresh these controls to manage the current account.");
    });
  }, []);

  const load = useCallback(async (action?: "request" | "cancel") => {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setMessage("");
    try {
      const auth = getBrowserAuth(); await auth?.authStateReady(); current.signal.throwIfAborted();
      const user = auth?.currentUser; setAvailable(!!user);
      if (!receipt.current) {
        try { const saved = receiptSchema.safeParse(JSON.parse(sessionStorage.getItem(receiptKey) ?? "null")); if (saved.success) receipt.current = saved.data; } catch { /* The current tab can still check its receipt without storage. */ }
      }
      if (user && receipt.current?.uid !== user.uid) receipt.current = null;
      if (!user && !receipt.current) { setMessage("No account or guest session is active here. Open this page in the app or browser where you planned your date."); return; }
      const expectedOwner = action === "request" ? confirmationOwner.current : displayedOwner.current;
      const token = action ? await confirmedDeletionToken(() => auth?.currentUser ?? null, expectedOwner, current.signal) : null;
      current.signal.throwIfAborted();
      if (auth?.currentUser?.uid !== user?.uid) return;
      const init = { signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]), cache: "no-store" as const };
      const response = action && token
        ? await fetch("/api/account/privacy", { ...init, method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, processing: "automatic-v1" }) })
        : receipt.current
        ? await fetch("/api/account/privacy", { ...init, headers: { "x-deletion-receipt": receipt.current.receipt } })
        : await plannerFetch("/api/account/privacy", init);
      const data = responseSchema.parse(await readPlanningResponse(response, () => {}));
      if (current.signal.aborted || auth?.currentUser?.uid !== user?.uid) return;
      displayedOwner.current = user?.uid ?? receipt.current?.uid ?? null;
      if (data.receipt && user) {
        receipt.current = { uid: user.uid, receipt: data.receipt };
        try { sessionStorage.setItem(receiptKey, JSON.stringify(receipt.current)); } catch { /* Preserve the receipt in memory when browser storage is unavailable. */ }
      }
      if (action === "cancel") {
        receipt.current = null;
        try { sessionStorage.removeItem(receiptKey); } catch { /* The in-memory receipt has already been removed. */ }
      }
      setStatus(data.status); setAutomatic(data.automatic); setProcessAfter(data.processAfter); setOpen(false); setNeedsSignIn(false);
      setMessage(action === "request" ? "Your request is scheduled. You can withdraw it during the next 15 minutes. Keep this tab to check completion; verified account emails also receive a confirmation." : action === "cancel" ? "Deletion request withdrawn." : "");
      if (data.status === "complete" && receipt.current && (!user || user.uid === receipt.current.uid)) {
        completedOwner.current = receipt.current.uid;
        try {
          localStorage.removeItem(savedAccountKey(receipt.current.uid));
          for (const key of ["date-atlas:preferences:v1", "date-atlas:favorites:v1"]) localStorage.removeItem(key);
          for (const key of Object.keys(sessionStorage)) if (key.startsWith("date-atlas:") && key !== receiptKey) sessionStorage.removeItem(key);
        } catch { /* Server deletion is complete even when device storage is blocked. */ }
        if (auth && auth.currentUser?.uid === receipt.current.uid) await signOut(auth);
      }
    } catch (error) {
      if (!current.signal.aborted) {
        if (error instanceof DeletionSessionChangedError) { setOpen(false); setAvailable(false); setStatus("none"); receipt.current = null; }
        if (action === "request" && error instanceof PlanningRequestError && error.status === 401 && getBrowserAuth()?.currentUser?.isAnonymous === false) setNeedsSignIn(true);
        setMessage(error instanceof Error ? error.message : "Please try again.");
      }
    } finally { if (!current.signal.aborted) { controller.current = null; setBusy(false); } }
  }, []);
  useEffect(() => {
    if (!expanded || status !== "requested" && status !== "processing") return;
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [expanded, status, load]);

  return <details onToggle={(event) => { const showing = event.currentTarget.open; setExpanded(showing); if (showing) void load(); }}>
    <summary>Privacy &amp; account deletion</summary>
    <p>Remove your account or guest session, private dates, saved plans, feedback and invitation links. New requests start automatically after a 15-minute withdrawal window and usually finish within 24 hours. If your request is still processing after 24 hours, contact support@adateatlas.com.</p>
    <p>We send a completion email to verified account addresses. Guest users and accounts without a verified email can check the completion receipt here. Keep this tab open until deletion is complete.</p>
    <p>Request status: {status === "none" ? "No active request" : status === "complete" ? "Deletion complete. Your account and its private records have been removed." : status}</p>
    {status === "requested" && !automatic && <p>Your earlier request is reviewed manually. You can withdraw it and submit a new request to use automatic processing.</p>}
    {status === "requested" && processAfter && <p>You can withdraw until {new Date(processAfter).toLocaleString()}.</p>}
    {status === "requested" && <Button variant="outline" disabled={busy || !available} onClick={() => void load("cancel")}>Withdraw request</Button>}
    {status !== "none" && <Button variant="outline" disabled={busy} onClick={() => void load()}>Check request status</Button>}
    {status === "none" && !available && <Button variant="outline" disabled={busy} onClick={() => void load()}>Refresh account controls</Button>}
    {status === "none" && available && <AlertDialog open={open} onOpenChange={(showing) => { confirmationOwner.current = showing ? displayedOwner.current : null; setOpen(showing); }}>
      <AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>Delete account or guest data</Button></AlertDialogTrigger>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete your account and private data?</AlertDialogTitle><AlertDialogDescription>You can withdraw for 15 minutes. After that, access is disabled and your account, saved dates, feedback and invitation links are permanently removed. Deletion usually finishes within 24 hours. This cannot be undone once processing begins.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void load("request"); }}>Schedule account deletion</AlertDialogAction></AlertDialogFooter>
        {message && <p role="alert">{message}</p>}
      </AlertDialogContent>
    </AlertDialog>}
    {needsSignIn && <Button variant="outline" onClick={() => { setOpen(false); setReauthenticating(true); }}>Sign in again</Button>}
    {reauthenticating && <AccountAccess onDone={() => { setReauthenticating(false); setNeedsSignIn(false); setMessage("Signed in again. Submit the deletion request when you are ready."); }} />}
    {message && !open && <p role="status">{message}</p>}
  </details>;
}
