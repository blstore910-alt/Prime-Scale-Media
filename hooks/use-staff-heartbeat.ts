"use client";

// ── DE HARTSLAG VOOR DE URENREGISTRATIE ─────────────────────────────
//
// Plak 189: staff_heartbeat() telt actieve minuten per admin per dag.
// Elke minuut een tik, alleen als het tabblad zichtbaar is; een gat van
// meer dan drie minuten telt de database niet mee. Bestaat de functie
// nog niet (plak niet geplakt), dan faalt de tik stil en stopt hij.

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useStaffHeartbeat() {
  useEffect(() => {
    const sb = createClient();
    let stop = false;
    const tik = async () => {
      if (stop || document.visibilityState !== "visible") return;
      const { error } = await sb.rpc("staff_heartbeat");
      if (error && /does not exist|schema cache|404/i.test(error.message ?? "")) stop = true;
    };
    void tik();
    const id = window.setInterval(() => void tik(), 60_000);
    const zicht = () => {
      if (document.visibilityState === "visible") void tik();
    };
    document.addEventListener("visibilitychange", zicht);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", zicht);
    };
  }, []);
}
