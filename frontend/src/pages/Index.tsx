import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { AccessForm } from "@/components/AccessForm.tsx";
import { DiagnosticForm } from "@/components/DiagnosticForm.tsx";
import { DiagnosticResult } from "@/components/DiagnosticResult.tsx";
import { Button } from "@/components/ui/button.tsx";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type DiagnosisResult = {
  risk_band: "green" | "yellow" | "orange" | "red";
  likely_issue: string;
  why: string;
  price_estimate: {
    parts_low: number | null;
    parts_high: number | null;
    notes: string;
  };
};

type UserInfo = {
  first_name?: string;
  diagnoses_remaining?: number;
};

type Status = "loading" | "signup" | "ready";

const Index = () => {
  const [status, setStatus] = useState<Status>("loading");
  const [slowStart, setSlowStart] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);

  // Checks the session cookie. /validate-token rejects expired or used-up accounts.
  const checkSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/validate-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 403 && typeof data.detail === "string" && data.detail.includes("used all")) {
          setAccessMessage(data.detail);
        }
        setStatus("signup");
        return;
      }
      setUserInfo(data.user);
      setStatus("ready");
    } catch {
      setAccessMessage("Couldn't reach the Whipify API. Make sure the backend is running.");
      setStatus("signup");
    }
  }, []);

  useEffect(() => {
    // Free-tier hosts can take a while to wake up; tell the user instead of looking frozen
    const slowTimer = setTimeout(() => setSlowStart(true), 5000);

    const init = async () => {
      // Support links of the form /?token=... by exchanging the token for a session cookie
      const urlToken = new URLSearchParams(window.location.search).get("token");
      if (urlToken) {
        window.history.replaceState({}, "", window.location.pathname);
        try {
          await fetch(`${API_BASE}/auth/exchange-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ access_token: urlToken }),
          });
        } catch {
          // Fall through to the session check, which shows the sign-up form if needed
        }
      }
      await checkSession();
      clearTimeout(slowTimer);
    };

    init();
    return () => clearTimeout(slowTimer);
  }, [checkSession]);

  // /diagnose returns the new count; /validate-token is only a fallback since it rejects users at 0
  const updateDiagnosisCount = async (remaining?: number) => {
    if (typeof remaining === "number") {
      setUserInfo((prev) => ({ ...prev, diagnoses_remaining: Math.max(0, remaining) }));
      return;
    }
    await checkSession();
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking access...</p>
          {slowStart && (
            <p className="text-sm text-muted-foreground mt-2">Waking up the server, this can take up to a minute.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative gap-8">
      <div className="w-full max-w-3xl">
        {status === "ready" && userInfo && (
          <div className="text-center mb-4">
            <p className="text-sm text-muted-foreground">
              Welcome back, {userInfo.first_name}! You have{" "}
              <span className="font-semibold text-foreground">
                {userInfo.diagnoses_remaining} diagnosis{userInfo.diagnoses_remaining !== 1 ? "es" : ""}
              </span>{" "}
              remaining.
            </p>
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">Diagnose your car</h1>
          <p className="text-base text-muted-foreground">
            Enter your car's details and symptoms to get a fast, reliable diagnosis.
          </p>
        </div>

        {status === "signup" ? (
          <AccessForm
            apiBase={API_BASE}
            message={accessMessage}
            onAccessGranted={() => {
              setAccessMessage(null);
              checkSession();
            }}
          />
        ) : (
          <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
            <DiagnosticForm
              onDiagnosisComplete={(result) => {
                setDiagnosisResult({
                  risk_band: result.risk_band,
                  likely_issue: result.likely_issue,
                  why: result.rationale,
                  price_estimate: result.price_estimate ?? {
                    parts_low: null,
                    parts_high: null,
                    notes: "Price information unavailable",
                  },
                });
              }}
              onDiagnosisCountUpdate={updateDiagnosisCount}
            />
          </div>
        )}
      </div>

      {diagnosisResult && (
        <div className="w-full max-w-3xl animate-fade-in">
          <DiagnosticResult result={diagnosisResult} />
        </div>
      )}

      {diagnosisResult && (
        <div className="w-full max-w-3xl animate-fade-in">
          <Button size="lg" className="w-full h-14 text-base font-semibold" disabled title="Shop booking is on the roadmap">
            <Wrench className="mr-2 h-5 w-5" />
            Book a Shop (coming soon)
          </Button>
        </div>
      )}
    </div>
  );
};

export default Index;
