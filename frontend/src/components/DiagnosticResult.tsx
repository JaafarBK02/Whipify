import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Separator } from "@/components/ui/separator.tsx";

interface DiagnosticResultProps {
  result: {
    risk_band: "green" | "yellow" | "orange" | "red";
    likely_issue: string;
    why: string;
    price_estimate: {
      parts_low: number | null;
      parts_high: number | null;
      notes: string;
    };
  };
}

const riskMessages = {
  green: {
    colorClass: "bg-green-500",
    message: "Safe to drive. Just keep an eye on it for changes.",
  },
  yellow: {
    colorClass: "bg-yellow-500",
    message: "Drivable, but have it checked within a few days.",
  },
  orange: {
    colorClass: "bg-orange-500",
    message: "Drive short distance to a shop – moderate risk.",
  },
  red: {
    colorClass: "bg-destructive",
    message: "Unsafe to drive. Stop the vehicle and call for assistance.",
  },
};

export function DiagnosticResult({ result }: DiagnosticResultProps) {
  const risk = riskMessages[result.risk_band];

  const formatPrice = (price: number | null): string => {
    if (price === null) return "N/A";
    return `$${price.toFixed(0)}`;
  };

  const hasPriceRange = result.price_estimate.parts_low !== null && result.price_estimate.parts_high !== null;

  return (
    <Card className="w-full mt-8 bg-card border border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-foreground">
          Diagnosis Result
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Safety & Next Step */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-2">
            Safety & Next Step
          </h3>
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${risk.colorClass} shrink-0`} />
            <p className="text-sm text-foreground">{risk.message}</p>
          </div>
        </div>

        <Separator />

        {/* Likely Issue */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-2">
            Likely Issue
          </h3>
          <p className="text-sm text-foreground">{result.likely_issue}</p>
        </div>

        <Separator />

        {/* Why? */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-2">
            Why?
          </h3>
          <p className="text-sm text-foreground">{result.why}</p>
        </div>

        <Separator />

        {/* Part Price */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-2">
            Part Price
          </h3>
          {hasPriceRange ? (
            <p className="text-sm text-foreground">
              {formatPrice(result.price_estimate.parts_low)} - {formatPrice(result.price_estimate.parts_high)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Price unavailable
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}