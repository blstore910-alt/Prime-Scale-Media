"use client";

import { scorePassword } from "@/lib/password-strength";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const COLORS = [
  "bg-destructive", // 0
  "bg-destructive", // 1
  "bg-amber-500", // 2
  "bg-amber-500", // 3
  "bg-green-500", // 4
  "bg-green-600", // 5
];

/**
 * Visual strength meter — five segments that light up as the score
 * increases, plus a text label and reasons list. Client-side UX only;
 * the real 12-char minimum is enforced server-side.
 */
export default function PasswordStrength({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const result = useMemo(() => scorePassword(password), [password]);

  return (
    <div className={cn("space-y-1", className)} aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded",
              i < result.score ? COLORS[result.score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span
          className={cn(
            "font-medium",
            result.score <= 1 && "text-destructive",
            result.score >= 4 && "text-green-600",
          )}
        >
          {password.length > 0 ? result.label : ""}
        </span>
        {result.reasons.length > 0 && password.length > 0 && (
          <span className="text-muted-foreground">{result.reasons[0]}</span>
        )}
      </div>
    </div>
  );
}
