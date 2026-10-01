// ── DE ICONEN DIE EEN PARTNER KAN KRIJGEN ───────────────────────────
//
// Een vaste lijst, zodat de admin kiest uit tegels en niet een naam moet
// typen, en de database (plak 181) alleen een sleutel uit deze lijst
// bewaart. "auto" kiest op de categorie, zoals de eerste versie deed.

import {
  BarChart3,
  Building2,
  Camera,
  CreditCard,
  Globe,
  GraduationCap,
  Handshake,
  Megaphone,
  Package,
  Palette,
  Rocket,
  Scale,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const PARTNER_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "package", label: "Fulfillment", Icon: Package },
  { key: "truck", label: "Shipping", Icon: Truck },
  { key: "store", label: "E-commerce", Icon: ShoppingBag },
  { key: "megaphone", label: "Marketing", Icon: Megaphone },
  { key: "palette", label: "Design", Icon: Palette },
  { key: "camera", label: "Content", Icon: Camera },
  { key: "chart", label: "Analytics", Icon: BarChart3 },
  { key: "card", label: "Payments", Icon: CreditCard },
  { key: "scale", label: "Legal & tax", Icon: Scale },
  { key: "wrench", label: "Tools", Icon: Wrench },
  { key: "cap", label: "Education", Icon: GraduationCap },
  { key: "users", label: "Community", Icon: Users },
  { key: "globe", label: "Global", Icon: Globe },
  { key: "rocket", label: "Growth", Icon: Rocket },
  { key: "sparkles", label: "AI", Icon: Sparkles },
  { key: "handshake", label: "Partner", Icon: Handshake },
  { key: "building", label: "Company", Icon: Building2 },
];

export const PARTNER_ICON_KEYS = PARTNER_ICONS.map((i) => i.key);

/** Een icoon op de categorie, voor "auto" en voor oude rijen zonder
 *  gekozen icoon. Wat niets raakt, krijgt een gebouw. */
const OP_CATEGORIE: [RegExp, string][] = [
  [/fulfil|warehouse|opslag|3pl/i, "package"],
  [/ship|verzend|logist|deliver/i, "truck"],
  [/shop|store|ecom|winkel/i, "store"],
  [/creat|design|ontwerp|brand/i, "palette"],
  [/content|video|foto|photo|ugc/i, "camera"],
  [/ads|agency|bureau|market|media/i, "megaphone"],
  [/pay|betaal|bank|finance|psp/i, "card"],
  [/legal|juridi|tax|belasting|account/i, "scale"],
  [/tool|software|saas|app|tech/i, "wrench"],
  [/course|coach|academ|train|leer|educ/i, "cap"],
  [/\bai\b|automat/i, "sparkles"],
];

export function partnerIcon(icon: string | null | undefined, category: string | null | undefined): LucideIcon {
  const direct = PARTNER_ICONS.find((i) => i.key === icon);
  if (direct) return direct.Icon;
  const c = category ?? "";
  for (const [re, key] of OP_CATEGORIE) if (re.test(c)) return PARTNER_ICONS.find((i) => i.key === key)!.Icon;
  return Building2;
}
