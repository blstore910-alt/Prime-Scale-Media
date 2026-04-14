export function getDbActionBadgeClass(dbAction?: string | null) {
  switch (dbAction) {
    case "INSERT":
      return "border-emerald-200 text-emerald-700 bg-emerald-50/40";
    case "UPDATE":
      return "border-amber-200 text-amber-700 bg-amber-50/40";
    case "DELETE":
      return "border-rose-200 text-rose-700 bg-rose-50/40";
    default:
      return "border-muted-foreground/30 text-muted-foreground";
  }
}

export function formatActionLabel(action?: string | null) {
  if (!action) return "Unknown";
  return action
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
