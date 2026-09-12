// Small inline badge showing an advertiser's community (e.g. "NSA"). Rendered
// next to the advertiser name on the admin topups + wallets views so staff see
// a customer's community at a glance. Renders nothing when there's no community.
export function CommunityPill({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span
      title="Community"
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: ".66rem",
        fontWeight: 700,
        lineHeight: 1.5,
        padding: "0 7px",
        borderRadius: 999,
        background: "rgba(99,102,241,.12)",
        color: "#6366f1",
        border: "1px solid rgba(99,102,241,.28)",
        whiteSpace: "nowrap",
        letterSpacing: ".01em",
      }}
    >
      {name}
    </span>
  );
}
