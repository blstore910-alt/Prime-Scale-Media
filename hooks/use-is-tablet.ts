"use client";

import { useEffect, useState } from "react";

// SSR-safe viewport hook.
//
// The bare `useMediaQuery` from usehooks-ts returns `false` on the
// server (no matchMedia there) but flips to `true` on the client the
// moment it mounts on a desktop viewport. Components that branch on
// it — {isTablet ? <Table/> : <Cards/>} — render one thing during SSR
// and a different thing on hydration, tripping React error #418.
//
// This hook always returns `undefined` on the very first render (both
// server and client agree), then the real matchMedia value on the
// second render after mount. Callers guard as:
//
//   const isTablet = useIsTablet();
//   if (isTablet === undefined) return <Skeleton />; // or null
//   return isTablet ? <Table/> : <Cards/>;
//
// No hydration mismatch — SSR paints the same "loading" branch the
// first client render will paint.

const QUERY = "(min-width: 768px)";

export function useIsTablet(): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") {
      return;
    }
    const mql = window.matchMedia(QUERY);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return matches;
}
