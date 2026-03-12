import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";

interface LockScreenProps {
  onUnlock: () => Promise<void>;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      await onUnlock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl font-bold tracking-tight">MySquad</h1>
        <p className="text-muted-foreground">Unlock to continue</p>
        <Button size="lg" onClick={handleUnlock} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
          {loading ? "Authenticating..." : "Unlock"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
