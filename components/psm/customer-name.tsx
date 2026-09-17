import { firstName } from "@/lib/display-name";

/**
 * How a customer is identified in a list: the CLIENT CODE first, in the
 * display face, with the name smaller beneath it.
 *
 * The other way round is the instinct — people have names, so the name goes
 * on top — but it is wrong for this app. The code is what the desk works
 * with: it is on the invoice, it is the prefix of every payment reference,
 * it is what a bank statement shows, and it is unique where a name is not.
 * Two customers can be "john"; only one is PSM0002. Reading a list to find
 * PSM0002 with the codes set as small grey subtitles means scanning the
 * quiet line instead of the loud one.
 *
 * The name stays, because a code alone is unkind — you should be able to see
 * who you are about to charge — it is just no longer the thing you hunt for.
 *
 * `full` renders the whole name (detail views); the default is the first
 * name only, which survives a 400px column where a full one truncates
 * mid-word.
 */
export default function CustomerName({
  clientCode,
  name,
  full = false,
  community,
  className,
}: {
  clientCode?: string | null;
  name?: string | null;
  full?: boolean;
  /** Optional community pill rendered beside the code, e.g. "NSA". */
  community?: React.ReactNode;
  className?: string;
}) {
  const code = (clientCode ?? "").trim();
  const shown = full ? (name ?? "").trim() : firstName(name);

  // Neither is a real state — an advertiser row that never got a client code
  // shows up in admin lists, and pretending otherwise hides a broken record.
  if (!code && !shown) {
    return <span className={`cust cust-none${className ? ` ${className}` : ""}`}>—</span>;
  }

  return (
    <span className={`cust${className ? ` ${className}` : ""}`}>
      <span className="cust-code">
        {code || shown}
        {community}
      </span>
      {code && shown && <span className="cust-name">{shown}</span>}
    </span>
  );
}
