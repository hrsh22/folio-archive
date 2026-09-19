"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolioApp } from "./folio-app";

export function KeeperGate() {
  const [allowed, setAllowed] = useState(false),
    [loading, setLoading] = useState(true);
  const [key, setKey] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((v) => setAllowed(v.authenticated))
      .catch(() => setError("Could not check your session. Please retry."))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="keeper-gate">
        <LoaderCircle className="spin" />
        <p>Opening the keeper’s desk…</p>
      </div>
    );
  if (allowed) return <FolioApp />;
  return (
    <main className="keeper-gate">
      <Link href="/" className="text-button">
        <ArrowLeft size={16} /> Back to the reading room
      </Link>
      <div className="keeper-card">
        <KeyRound size={26} />
        <p className="eyebrow">THE KEEPER’S DESK</p>
        <h1>
          A little care.
          <br />
          <em>A longer life.</em>
        </h1>
        <p>
          Sign in to edit collections, publish a new edition, or renew their
          storage. Reading and recovery are open to everyone.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError("");
            try {
              const r = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key }),
              });
              const value = await r.json();
              if (!r.ok) throw new Error(value.error);
              setKey("");
              setAllowed(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Label htmlFor="keeper-key">Keeper access key</Label>
          <Input
            id="keeper-key"
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            minLength={32}
          />
          {error && (
            <p role="alert" className="reader-error">
              {error}
            </p>
          )}
          <Button type="submit">Open workspace</Button>
        </form>
        <small>
          Your Bee wallet and signing keys stay on the keeper’s computer.
        </small>
      </div>
    </main>
  );
}
