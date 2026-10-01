// ── HET KLANTHANDBOEK IN HET NEDERLANDS ─────────────────────────────
//
// De eigenaar, 01-10: "vooral hulp moet ook compleet in NL".
//
// Per hoofdstuk-id uit CUSTOMER_GUIDES (components/admin/manual-content.ts),
// met precies evenveel stappen en notities als het Engels. De test in
// tests/lib/customer-guide-nl.test.ts houdt dat bij: een stap die in het
// Engels bijkomt en hier niet, laat de Nederlandse lezer een stap missen
// zonder dat iemand het ziet -- dan faalt de test liever.
//
// Geen iconen en geen tonen hier: die komen uit het Engels, zodat een
// hoofdstuk in beide talen hetzelfde oogt. De paden gebruiken de namen
// zoals het Nederlandse menu ze toont (Facturen, Opties, Mijn referrals).
//
// Vaktermen blijven Engels, zoals in de rest van de app: wallet, top-up,
// ad account, exchange, referral, fee.

export type SectieNL = {
  title: string;
  path: string;
  intro: string;
  steps: string[];
  notes?: { label: string; text: string }[];
};

export const GUIDE_HEAD_NL: Record<"advertiser" | "affiliate", { heading: string; lead: string }> = {
  advertiser: {
    heading: "Zo werkt het",
    lead: "Alles wat je hier kunt doen, stap voor stap — zoals ons team het uitlegt.",
  },
  affiliate: {
    heading: "Zo werkt het",
    lead: "Hoe je link verdient, waarvoor je betaald krijgt, en hoe het geld bij je komt.",
  },
};

export const GUIDE_NL: Record<string, SectieNL> = {
  // ── ADVERTEERDER ──────────────────────────────────────────────────
  "adv-wallet": {
    title: "Je wallet",
    path: "Wallet",
    intro:
      "In je wallet staat het geld dat je ons hebt gestuurd. Al het andere — een ad account funden, een factuur betalen — gaat eruit. Je vult hem aan met een bankoverschrijving.",
    steps: [
      "Open Wallet en druk op Top up. Kies de valuta die je gaat sturen, en daarna het bedrag.",
      "Je ziet de bankgegevens om naar over te maken en een betaalkenmerk. Kopieer het kenmerk precies en zet het in de omschrijving van je overboeking — zo koppelen we de betaling aan jou.",
      "Upload het betaalbewijs van je bank en druk op Verstuur. De top-up staat dan op wachten.",
      "Zodra we het geld binnen zien komen, controleren we het en staat het bedrag in je saldo. Je krijgt hoe dan ook een melding.",
    ],
    notes: [
      {
        label: "Het kenmerk",
        text: "Een overboeking zonder kenmerk, of met het kenmerk van een andere top-up, moet met de hand worden gekoppeld en duurt langer. Kopieer het van het scherm; typ het niet uit je hoofd.",
      },
      {
        label: "Welke bank",
        text: "De bankgegevens verschillen per valuta en per soort account. Gebruik de gegevens op dat top-upscherm, niet gegevens die je eerder hebt bewaard.",
      },
      {
        label: "Geen opname",
        text: "Geld in je wallet kan niet terug naar je bank. Je besteedt het aan ad accounts en facturen, en geld dat op een ad account staat kun je terugvragen naar je wallet.",
      },
    ],
  },
  "adv-accounts": {
    title: "Je ad accounts",
    path: "Ad accounts",
    intro:
      "Een ad account is waar je echt op adverteert. Je vraagt er een aan, wij zetten het op, en daarna fund je het vanuit je wallet.",
    steps: [
      "Open Ad accounts en druk op Vraag aan. Kies het platform, de valuta en de tijdzone, en vul de website in waarvoor je adverteert.",
      "Valuta en tijdzone kunnen niet meer veranderen zodra het account bestaat, dus controleer ze voordat je verstuurt.",
      "Wij bekijken de aanvraag. Ontbreekt er iets, dan krijg je een reden en kun je een nieuwe indienen.",
      "Meestal is het binnen één werkdag na goedkeuring live, en je krijgt een melding zodra het zover is.",
      "Is het account live, dan staat het in je lijst met naam en ID, en een Top up-knop.",
    ],
    notes: [
      {
        label: "Extra accounts",
        text: "Je plan bevat een aantal ad accounts. Daarboven gaat een extra account van je wallet af, en je ziet het bedrag voordat je bevestigt.",
      },
    ],
  },
  "adv-funding": {
    title: "Een ad account funden",
    path: "Ad accounts › Top up",
    intro:
      "Geld gaat van je wallet naar het account, min de top-up fee. Dit is de enige stap die je niet zelf terug kunt draaien.",
    steps: [
      "Druk op Top up bij het account en vul het bedrag in.",
      "Het scherm toont de fee en wat er echt op het account komt. Controleer beide voordat je bevestigt.",
      "Bevestig. Het bedrag gaat meteen van je wallet af en de funding staat op onderweg.",
      "Is het aangekomen, dan verandert de status in op het account.",
    ],
    notes: [
      {
        label: "Eén richting",
        text: "Geld op een ad account komt alleen terug via een terugboekingsverzoek, dat wij moeten goedkeuren. Fund een account niet met meer dan je eraan wilt besteden.",
      },
    ],
  },
  "adv-withdraw": {
    title: "Geld terughalen van een account",
    path: "Ad accounts › Details › Naar wallet",
    intro:
      "Staat er geld op een account dat je liever ergens anders aan besteedt, dan kun je het terugvragen naar je wallet.",
    steps: [
      "Open het account, druk op Details en dan op Naar wallet.",
      "Vul het bedrag in. Het scherm toont het maximum dat je kunt terugvragen en laat je er niet overheen gaan.",
      "Controleer het overzicht en verstuur. Het verzoek komt bij ons ter goedkeuring; het gaat niet direct.",
      "Na goedkeuring wordt het bedrag bijgeschreven op je wallet, in de valuta van het account, en kan het naar een ander account of een factuur.",
    ],
    notes: [
      {
        label: "Terug naar de wallet",
        text: "Een terugboeking zet geld terug in je wallet, nooit op je bank.",
      },
      {
        label: "Hoeveel je kunt terugvragen",
        text: "Tot wat er op het account is gezet, min wat je al hebt teruggevraagd. Geld dat al aan advertenties is besteed komt niet terug, dus waar we het live saldo van het account kunnen zien, is het maximum wat er echt op staat.",
      },
    ],
  },
  "adv-billing": {
    title: "Je plan en facturen",
    path: "Facturen",
    intro:
      "Je plan is een vast bedrag per maand. Elke periode komt er een factuur, die je uit je wallet betaalt.",
    steps: [
      "Facturen toont je plan, de volgende betaaldatum en elke factuur.",
      "Je krijgt een e-mail bij elke nieuwe factuur, en een herinnering een paar dagen voor de vervaldatum.",
      "Een openstaande factuur heeft een Pay now-knop, die het bedrag uit je wallet haalt. Je ziet je saldo ervoor en erna voordat je bevestigt.",
      "Is een factuur op de vervaldatum niet betaald, dan schrijven we hem automatisch af van je wallet.",
      "Elke factuur kun je als pdf downloaden voor je eigen boekhouding.",
    ],
    notes: [
      {
        label: "Houd saldo aan",
        text: "Staat er te weinig in je wallet als een factuur vervalt, dan blijft de factuur open en laten we het je weten. Een top-up lost het op.",
      },
    ],
  },
  "adv-company": {
    title: "Je bedrijfsgegevens",
    path: "Opties › Bedrijf",
    intro: "Je bedrijfsnaam, adres en btw-nummer zijn wat er op je facturen staat.",
    steps: [
      "Open Opties › Bedrijf en vul de gegevens in.",
      "Bewaar. Nieuwe facturen gebruiken de nieuwe gegevens; facturen die al zijn uitgegeven houden wat erop stond.",
    ],
    notes: [
      {
        label: "Voor je eerste factuur",
        text: "Vul ze vroeg in. Is je eerste factuur gemaakt voordat je dat deed, dan neemt hij je bedrijfsgegevens over zodra je ze bewaart.",
      },
    ],
  },
  "adv-privacy": {
    title: "Meldingen en je gegevens",
    path: "Opties › Meldingen / Je gegevens",
    intro: "Jij kiest waarover je bericht krijgt, en jij beslist wat er met je account gebeurt.",
    steps: [
      "Opties › Meldingen: zet elke soort melding aan of uit, en zet push aan als je ze op je telefoon wilt.",
      "Opties › Je gegevens: log in één keer uit op elk apparaat, bijvoorbeeld na het gebruik van een gedeelde computer.",
      "Opties › Je gegevens: vraag ons je account te verwijderen. We bekijken het verzoek en nemen eerst contact op; er wordt niets verwijderd voor die tijd.",
    ],
  },

  // ── AFFILIATE ─────────────────────────────────────────────────────
  "aff-link": {
    title: "Je referral-link",
    path: "Mijn referrals",
    intro: "Iedereen die je aanbrengt, komt binnen via je link. Die koppelt een nieuwe klant aan jou.",
    steps: [
      "Kopieer je link op het dashboard.",
      "Wie zich via die link aanmeldt, is vanaf dat moment aan jou gekoppeld.",
      "Aangebrachte klanten verschijnen in je lijst zodra hun account is aangemaakt.",
    ],
    notes: [
      {
        label: "De link is het bewijs",
        text: "Wie zich aanmeldt zonder jouw link, is niet aan jou gekoppeld, en dat kun je achteraf niet zelf rechtzetten. Is het gebeurd, laat het ons dan weten voordat diegene gaat besteden.",
      },
    ],
  },
  "aff-earnings": {
    title: "Wat je verdient",
    path: "Mijn referrals",
    intro:
      "Commissie spreken we per referral af, dus twee van je klanten kunnen verschillende voorwaarden hebben. Je eigen voorwaarden staan bij elke referral.",
    steps: [
      "Mijn referrals toont elke aangebrachte klant en wat die heeft opgeleverd.",
      "Commissie kan een eenmalig bedrag zijn, een maandbedrag of een deel van wat ze besteden, afhankelijk van wat is afgesproken.",
      "Gebruik het periodefilter, en Export voor een spreadsheet.",
      "Je niveau — Starter, Riser, Scaler, Legend — volgt je totale verdiensten. Het is een mijlpaal, geen tarief: je commissie staat per referral vast en verandert niet met je niveau.",
    ],
    notes: [
      {
        label: "Voorlopig tot uitbetaald",
        text: "Commissie die nog niet aan je is uitbetaald, is voorlopig. Haalt een klant geld terug van een ad account, dan vervalt het deel van je openstaande commissie dat daaruit kwam. Commissie die al aan je is uitbetaald, blijft uitbetaald.",
      },
    ],
  },
  "aff-payout": {
    title: "Uitbetaald krijgen",
    path: "Wallet",
    intro: "Hier vraag je om uitbetaling; wij maken het met de hand over.",
    steps: [
      "Wallet toont wat je hebt verdiend en wat klaarstaat om uit te betalen.",
      "Heb je het minimum bereikt, druk dan op Uitbetalen. Kies wat je uitbetaald wilt krijgen, de valuta en je bankgegevens.",
      "Wij controleren het verzoek en maken het met de hand over. Er gaat niets automatisch weg.",
      "Elke uitbetaling staat onder Eerdere uitbetalingen, met datum, bedrag en ons kenmerk.",
    ],
  },
  "aff-customers": {
    title: "Je klanten",
    path: "Mijn referrals",
    intro: "Je ziet wie je hebt aangebracht en hoe het met ze gaat, zonder iets te zien dat van hen privé is.",
    steps: [
      "Referrals toont elke klant, wanneer die erbij kwam en de totale spend.",
      "Je ziet totalen, niet hun losse transacties, facturen of bankgegevens.",
    ],
  },
};
