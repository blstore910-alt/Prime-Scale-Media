"use client";

// Een bundel per rol (lekcontrole 01-10): deze wrapper laadt de code van
// "@/components/advertiser/layout" pas als die rol hem echt toont. Zonder dit zat de admincode
// (met leveranciers- en typenamen) in de JavaScript van elke klant.
// next/dynamic splitst alleen vanuit een CLIENT-bestand, vandaar dit.

import dynamic from "next/dynamic";

export default dynamic(() => import("@/components/advertiser/layout"));
