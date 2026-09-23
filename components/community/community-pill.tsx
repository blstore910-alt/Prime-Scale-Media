// Small inline badge showing an advertiser's community (e.g. "NSA"). Rendered
// next to the advertiser name on the admin topups + wallets views so staff see
// a customer's community at a glance. Renders nothing when there's no community.
export function CommunityPill({
  name,
  unknown,
}: {
  name?: string | null;
  /** The read failed. "We don't know" is not "they are in none" -- the
      community carries the customer's default fee, and this pill sits on
      the desk where their money is released. */
  unknown?: boolean;
}) {
  if (!name && unknown) {
    return (
      <span
        title="We couldn't read this customer's community"
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: ".66rem",
          fontWeight: 700,
          lineHeight: 1.5,
          padding: "0 7px",
          borderRadius: 999,
          background: "rgba(120,120,140,.10)",
          color: "var(--txt-2)",
          border: "1px dashed rgba(120,120,140,.35)",
          whiteSpace: "nowrap",
        }}
      >
        community ?
      </span>
    );
  }
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
