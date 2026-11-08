// ─────────────────────────────────────────────────────────────────────────────
// Partner definitions — CHANGE passwords before production deployment!
// ─────────────────────────────────────────────────────────────────────────────

export interface Partner {
  id: string;       // stable login/session id
  dbId: string;     // UUID stored in Supabase partner_id columns
  name: string;
  initials: string;
  color: string;    // accent color used in the UI
}

export const PARTNERS: Partner[] = [
  {
    id: "partner-a",
    dbId: "596c4367-1491-481f-b0f2-1825c2540ebd",
    name: "Partner A",
    initials: "PA",
    color: "#7C3AED",
  },
  {
    id: "partner-b",
    dbId: "2a304931-2230-4960-9e44-b19ed5e0178b",
    name: "Partner B",
    initials: "PB",
    color: "#DB2777",
  },
  {
    id: "partner-c",
    dbId: "652f4263-d4e3-4bf6-a5c4-778e8a08c710",
    name: "Partner C",
    initials: "PC",
    color: "#D97706",
  },
];

export function getPartnerById(id: string): Partner | null {
  return PARTNERS.find((p) => p.id === id || p.dbId === id) ?? null;
}

export function getPartnerDbId(id: string): string {
  return getPartnerById(id)?.dbId ?? id;
}
