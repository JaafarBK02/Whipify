import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

interface AccessFormProps {
  apiBase: string;
  message?: string | null;
  onAccessGranted: () => void;
}

/**
 * Beta sign-up: creates (or looks up) a beta user, then exchanges the returned
 * access token for an HTTP-only session cookie.
 */
export function AccessForm({ apiBase, message, onAccessGranted }: AccessFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const signup = await fetch(`${apiBase}/beta-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() }),
      });
      const signupData = await signup.json();
      if (!signup.ok || signupData.status !== "success") {
        throw new Error(signupData.message || signupData.detail || "Sign-up failed");
      }

      const exchange = await fetch(`${apiBase}/auth/exchange-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token: signupData.access_token }),
      });
      const exchangeData = await exchange.json();
      if (!exchange.ok) {
        throw new Error(exchangeData.detail || "Could not start your session");
      }

      onAccessGranted();
    } catch (err) {
      setError((err as Error).message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
      <h2 className="text-xl font-semibold text-foreground mb-1">Get beta access</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Each beta account includes 3 free diagnoses for 7 days.
      </p>

      {message && (
        <p className="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">{message}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First name</Label>
            <Input id="first_name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last name (optional)</Label>
            <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full py-6 font-medium" disabled={isSubmitting}>
          {isSubmitting ? "Setting up access..." : "Start diagnosing"}
        </Button>
      </form>
    </div>
  );
}
