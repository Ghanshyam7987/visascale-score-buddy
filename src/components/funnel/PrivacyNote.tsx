import { Lock } from 'lucide-react';

export function PrivacyNote() {
  return (
    <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-muted/40 border border-border/60">
      <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
      <p className="text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Client Privacy Guaranteed:</strong> All score calculations and document analyses are performed locally on your device. We do not store, save, or share your bank statements, scores, or personal data.
      </p>
    </div>
  );
}