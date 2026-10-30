"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Compass,
  LoaderCircle,
  Play,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoCatalog } from "@/lib/planner/demo-catalog";
import {
  generateSchema,
  type Experience,
  type RecommendationResult,
} from "@/lib/planner/schema";
import { planningToken } from "@/lib/firebase/planner-client";
import { requestGeneration } from "@/lib/planner/generation-client";
import { getAuthToken } from "@/lib/firebase/client";
import { recommendationResultSchema } from "@/lib/planner/response-schema";
import { money, nextSaturday } from "@/lib/utils";
import { PrivacyOperations } from "./privacy-operations";
import { VenueOperations } from "./venue-operations";
export function RecommendationLab() {
  const [profile, setProfile] = useState(() =>
    JSON.stringify(
      {
        city: "Lagos",
        area: "Lekki",
        occasion: "Romantic date",
        budget: 60000,
        vibes: ["Romantic", "Creative"],
        date: nextSaturday(),
        startTime: "15:00",
        duration: 300,
        quiet: true,
        interests: "art and quiet restaurants",
      },
      null,
      2,
    ),
  );
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [catalog, setCatalog] = useState<Experience[]>(demoCatalog);
  const [editor, setEditor] = useState(JSON.stringify(demoCatalog[0], null, 2));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  async function test() {
    setBusy(true);
    setMessage("");
    try {
      const input = generateSchema.parse({ request: JSON.parse(profile) });
      await planningToken();
      const data = await requestGeneration(JSON.stringify(input), crypto.randomUUID(), AbortSignal.timeout(75000), () => {});
      const parsedResult = recommendationResultSchema.parse(data);
      setResult(parsedResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }
  async function loadAdmin() {
    setBusy(true);
    setMessage("");
    try {
      const token = await getAuthToken();
      if (!token)
        throw new Error(
          "Sign in from the homepage with an administrator account to manage the live catalog. Demo tests are available without signing in.",
        );
      const response = await fetch("/api/admin/catalog", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAdmin(true);
      setCatalog(data.experiences);
      setMessage(
        `Live catalog connected. ${data.experiences.length} records loaded. Add new records using the editor.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Couldn't load catalog.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Please sign in.");
      const response = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(JSON.parse(editor)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(
        "Catalog record saved atomically. Reload the live catalog to review it.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page page-container">
      <Link className="text-link back-link" href="/">
        <ArrowLeft size={15} />
        Back to a date at las
      </Link>
      <div className="brand">
        <Compass size={30} />
        <span>a date at las.</span>
      </div>
      <div className="results-heading">
        <div>
          <span className="eyebrow">THE DETAILS BEHIND THE DATE</span>
          <h1>
            The recommendation <em>lab.</em>
          </h1>
          <p>
            Test constraints, review selection decisions, and manage sourced
            experience records.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void loadAdmin()}
        >
          <ShieldCheck size={16} />
          Connect admin catalog
        </Button>
      </div>
      <div className="data-notice">
        Demo tests use the same engine as the customer planner. Live catalog
        changes require a trusted Firebase administrator claim.
      </div>
      {message && (
        <p className="data-notice" role="status">
          {message}
        </p>
      )}
      {admin && <><VenueOperations /><PrivacyOperations /></>}
      <div className="admin-columns">
        <section>
          <h2>A sample couple</h2>
          <label className="field">
            <span>Planner input (JSON)</span>
            <textarea
              className="code-editor"
              rows={20}
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
              spellCheck={false}
            />
          </label>
          <Button disabled={busy} onClick={() => void test()}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Play size={16} />
            )}
            Test recommendations
          </Button>
          {result && (
            <div className="lab-results">
              <h3>{result.plans.length} valid plans</h3>
              {result.plans.map((plan) => (
                <p key={plan.id}>
                  <Check size={14} />
                  {plan.type} · {money(plan.total)} · {plan.score}% match
                </p>
              ))}
              <h3>Selection decisions</h3>
              <div className="diagnostics-table">
                {result.diagnostics.map((item) => (
                  <div key={item.id}>
                    <span className={item.eligible ? "accepted" : "rejected"}>
                      {item.eligible ? "Eligible" : "Rejected"}
                    </span>
                    <strong>{item.name}</strong>
                    <p>
                      {item.eligible
                        ? `Rank score ${item.score}. Eligible candidates are combined and checked against the full schedule and budget.`
                        : item.reasons.join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section>
          <h2>Experience records</h2>
          <p className="secondary-notice">
            Prices, hours, guest counts, moods, booking links, and verification
            are maintained together. This editor writes only when a trusted
            admin is connected.
          </p>
          <label className="field">
            <span>Load an experience</span>
            <select
              onChange={(event) => {
                const record = catalog.find(
                  (item) => item.id === event.target.value,
                );
                if (record) setEditor(JSON.stringify(record, null, 2));
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Select a catalog record
              </option>
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.demo ? " (demo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Complete experience record (JSON)</span>
            <textarea
              className="code-editor"
              rows={29}
              value={editor}
              spellCheck={false}
              onChange={(event) => setEditor(event.target.value)}
            />
          </label>
          <Button disabled={!admin || busy} onClick={() => void save()}>
            <Save size={16} />
            Save catalog record
          </Button>
        </section>
      </div>
    </main>
  );
}
