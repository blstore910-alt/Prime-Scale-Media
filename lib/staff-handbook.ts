// ── HET HANDBOEK VOOR ADMINS EN SUPER-ADMINS ────────────────────────
//
// De eigenaar, 01-10: "uitleg voor admin + super admin moet 10x
// duidelijker, voor iemand die met nul kennis begint: wat, waarom, hoe,
// de workflow, de wachtrijen op de homepage -- met een easy taalkiezer
// voor super veel talen."
//
// Puur data. Engels is de bron, Nederlands is met de hand geschreven;
// elke andere taal vertaalt de browser zelf (components/admin/
// staff-handbook.tsx). Elk hoofdstuk beantwoordt dezelfde vier vragen:
// wat is het, waarom doen we het, hoe (stap voor stap), en let op.
//
// GEEN LEVERANCIERSNAMEN, GEEN MARGES. Dit wordt aan klanten
// voorgelezen. "De leverancier", "het platform" -- nooit een naam.

export type HbLang = "en" | "nl";
type T = Record<HbLang, string>;
type TL = Record<HbLang, string[]>;

export type HbChapter = {
  id: string;
  icon: string; // lucide-naam, zie staff-handbook.tsx
  /** Alleen voor eigenaars (super admin). */
  owner?: boolean;
  /** Waar het staat in het menu. Niet vertaald: zo heet de knop. */
  where?: string;
  title: T;
  what: T;
  why: T;
  how: TL;
  watch?: TL;
};

export const HB_HEAD: Record<HbLang, { title: string; lead: string; what: string; why: string; how: string; watch: string; where: string; glossary: string; ownerOnly: string; search: string; contents: string }> = {
  en: {
    title: "Staff handbook",
    lead: "Start at chapter 1 and read in order — in twenty minutes you know how the whole app works. After that, use it to look things up.",
    what: "What is it?",
    why: "Why do we do it?",
    how: "How, step by step",
    watch: "Watch out",
    where: "Where",
    glossary: "Words we use",
    ownerOnly: "Owners only",
    search: "Search the handbook",
    contents: "Contents",
  },
  nl: {
    title: "Handboek voor medewerkers",
    lead: "Begin bij hoofdstuk 1 en lees op volgorde — in twintig minuten weet je hoe de hele app werkt. Daarna gebruik je het om dingen op te zoeken.",
    what: "Wat is het?",
    why: "Waarom doen we het?",
    how: "Hoe, stap voor stap",
    watch: "Let op",
    where: "Waar",
    glossary: "Woorden die we gebruiken",
    ownerOnly: "Alleen eigenaars",
    search: "Zoek in het handboek",
    contents: "Inhoud",
  },
};

export const HB_CHAPTERS: HbChapter[] = [
  {
    id: "start",
    icon: "rocket",
    title: { en: "1. What we do — the money flow", nl: "1. Wat we doen — de geldstroom" },
    what: {
      en: "Prime Scale Media provides advertising accounts (Meta, Google, TikTok and more) to online shops and marketers. Customers send us money by bank transfer. It lands in their wallet in this app. From that wallet they put money on their ad accounts, and we pay the advertising platform for them.",
      nl: "Prime Scale Media levert ad accounts (bij Meta, Google, TikTok en meer) aan webshops en marketeers. Klanten sturen ons geld per bankoverschrijving. Dat komt in hun wallet in deze app. Vanuit die wallet zetten ze geld op hun ad accounts, en wij betalen het advertentieplatform voor ze.",
    },
    why: {
      en: "Every screen in the app is one step of this money flow. Understand the flow and you understand the app. We earn a small fee on every ad-account top-up, plus a monthly plan fee.",
      nl: "Elk scherm in de app is een stap van deze geldstroom. Snap je de stroom, dan snap je de app. Wij verdienen een kleine fee op elke ad-account top-up, plus een maandelijks planbedrag.",
    },
    how: {
      en: [
        "Invite — an owner invites a new customer by email. The customer signs up and gets a client code, like PSM0022.",
        "Wallet top-up — the customer transfers money to our bank and uploads the payment slip. YOU check the bank and press Verify. Now the money is in their wallet.",
        "Ad-account request — the customer asks for a new ad account. You set it up and mark it done.",
        "Ad-account top-up — the customer moves money from their wallet to an ad account. You check and press Verify. The fee is taken here.",
        "Monthly invoice — every month the plan is invoiced and paid from the wallet.",
      ],
      nl: [
        "Uitnodiging — een eigenaar nodigt een nieuwe klant uit per e-mail. De klant meldt zich aan en krijgt een klantcode, zoals PSM0022.",
        "Wallet top-up — de klant maakt geld over naar onze bank en uploadt het betaalbewijs (slip). JIJ controleert de bank en drukt op Verify. Nu staat het geld in hun wallet.",
        "Ad-account aanvraag — de klant vraagt een nieuw ad account aan. Jij zet het klaar en markeert het als klaar.",
        "Ad-account top-up — de klant zet geld van zijn wallet op een ad account. Jij controleert en drukt op Verify. Hier wordt de fee afgehaald.",
        "Maandfactuur — elke maand wordt het plan gefactureerd en betaald uit de wallet.",
      ],
    },
    watch: {
      en: ["Money is only real when you SEE it on our bank. A slip is a picture, not money."],
      nl: ["Geld is pas echt als je het op onze bank ZIET. Een slip is een plaatje, geen geld."],
    },
  },
  {
    id: "day",
    icon: "sun",
    title: { en: "2. Your working day", nl: "2. Je werkdag" },
    what: {
      en: "A fixed routine. Same order every day, so nothing is forgotten.",
      nl: "Een vaste routine. Elke dag dezelfde volgorde, zodat niets vergeten wordt.",
    },
    why: {
      en: "Every item in a queue is a customer waiting for us. Oldest first is fair, and it means nobody is forgotten.",
      nl: "Elk item in een wachtrij is een klant die op ons wacht. Oudste eerst is eerlijk, en zo wordt niemand vergeten.",
    },
    how: {
      en: [
        "Open the app. You land on the Dashboard. At the top you see who is on shift right now.",
        "Look at the Queues block. A number on a queue means work is waiting. Zero means done.",
        "Work the queues from top to bottom. Inside a queue, do the oldest first.",
        "In between: answer customers on WhatsApp. Need bank details for a customer? Press the bank icon at the top right.",
        "Before you stop: every queue at zero, or tell the next person in the team chat what is still open and why.",
      ],
      nl: [
        "Open de app. Je komt op het Dashboard. Bovenaan zie je wie er nu dienst heeft.",
        "Kijk naar het blok Queues. Een getal bij een wachtrij betekent dat er werk wacht. Nul betekent klaar.",
        "Werk de wachtrijen van boven naar beneden af. Binnen een wachtrij: de oudste eerst.",
        "Tussendoor: klanten beantwoorden op WhatsApp. Bankgegevens nodig voor een klant? Druk op het bankicoon rechtsboven.",
        "Voordat je stopt: elke wachtrij op nul, of zeg in de teamchat tegen de volgende wat er nog open staat en waarom.",
      ],
    },
  },
  {
    id: "queues",
    icon: "list",
    where: "Dashboard › Queues",
    title: { en: "3. The queues on the homepage", nl: "3. De wachtrijen op de homepage" },
    what: {
      en: "The Queues block on the Dashboard is your to-do list. Each line is one kind of work; the number is how many are waiting. Click a line to open that queue.",
      nl: "Het blok Queues op het Dashboard is je takenlijst. Elke regel is een soort werk; het getal is hoeveel er wachten. Klik op een regel om die wachtrij te openen.",
    },
    why: {
      en: "So you never have to search for work. If all numbers are zero, the customers have everything they asked for.",
      nl: "Zodat je nooit werk hoeft te zoeken. Staan alle getallen op nul, dan hebben de klanten alles waar ze om vroegen.",
    },
    how: {
      en: [
        "Wallet topups to verify — customers say they paid. Check the bank, then Verify or Reject. (Chapter 4)",
        "Bank money not yet placed — money arrived on our bank that is not linked to a top-up yet. Find whose it is (reference, name), then link it.",
        "Ad-account requests — customers asking for a new ad account. (Chapter 6)",
        "Ad-account topups to verify — customers moving wallet money onto an ad account. (Chapter 7)",
        "Withdrawal requests — customers asking money back from an ad account to their wallet. (Chapter 8)",
        "Invoices past their due date — monthly invoices nobody paid. Remind the customer on WhatsApp. (Chapter 9)",
        "DST weeks to enter — the weekly digital-services tax figures. An owner enters these.",
        "Fee changes to approve — someone wants to change a customer's fee. Only an owner approves.",
        "Affiliates waiting / payouts to pay — owners only.",
      ],
      nl: [
        "Wallet topups to verify — klanten zeggen dat ze betaald hebben. Controleer de bank, dan Verify of Reject. (Hoofdstuk 4)",
        "Bank money not yet placed — geld op onze bank dat nog aan geen top-up gekoppeld is. Zoek uit van wie het is (referentie, naam) en koppel het.",
        "Ad-account requests — klanten die een nieuw ad account vragen. (Hoofdstuk 6)",
        "Ad-account topups to verify — klanten die walletgeld op een ad account zetten. (Hoofdstuk 7)",
        "Withdrawal requests — klanten die geld terug willen van een ad account naar hun wallet. (Hoofdstuk 8)",
        "Invoices past their due date — maandfacturen die niemand betaalde. Herinner de klant op WhatsApp. (Hoofdstuk 9)",
        "DST weeks to enter — de wekelijkse cijfers voor de digitale-dienstenbelasting. Dat doet een eigenaar.",
        "Fee changes to approve — iemand wil de fee van een klant veranderen. Alleen een eigenaar keurt goed.",
        "Affiliates waiting / payouts to pay — alleen eigenaars.",
      ],
    },
    watch: {
      en: ["A grey question mark instead of a number means the count could not be read — that is NOT zero. Reload, and tell an owner if it stays."],
      nl: ["Een grijs vraagteken in plaats van een getal betekent dat het aantal niet gelezen kon worden — dat is NIET nul. Herlaad, en zeg het tegen een eigenaar als het blijft."],
    },
  },
  {
    id: "wallet",
    icon: "upload",
    where: "Money › Wallet Topups",
    title: { en: "4. Verify a wallet top-up", nl: "4. Een wallet top-up verifiëren" },
    what: {
      en: "A customer transferred money to our bank and uploaded a slip. The top-up waits as Pending until you check it. Verify puts the money in their wallet.",
      nl: "Een klant heeft geld naar onze bank overgemaakt en een slip geüpload. De top-up wacht als Pending tot jij hem controleert. Verify zet het geld in hun wallet.",
    },
    why: {
      en: "This is the only door through which money enters a customer's wallet. If we verify money that never arrived, we lose it — the customer can spend it straight away.",
      nl: "Dit is de enige deur waardoor geld in de wallet van een klant komt. Verifiëren we geld dat nooit binnenkwam, dan zijn we het kwijt — de klant kan het meteen uitgeven.",
    },
    how: {
      en: [
        "Open Money › Wallet Topups. You see the Pending ones.",
        "Open the oldest. Note: amount, currency, client code, reference.",
        "Look at our bank account. Find the incoming payment with the same amount, currency and reference (it starts with the customer's client-code digits, e.g. 0022-…).",
        "Open the slip and check it matches: amount, date, sender name.",
        "Everything matches → press Verify, then confirm. The customer gets a notification and sees the money.",
        "Not on the bank yet → leave it Pending. Check again later. Do NOT verify on the slip alone.",
        "Wrong amount, wrong currency, or not ours → Reject, with a reason the customer will understand (chapter 5).",
      ],
      nl: [
        "Open Money › Wallet Topups. Je ziet de Pending-aanvragen.",
        "Open de oudste. Noteer: bedrag, valuta, klantcode, referentie.",
        "Kijk op onze bankrekening. Zoek de binnenkomende betaling met hetzelfde bedrag, dezelfde valuta en referentie (die begint met de cijfers van de klantcode, bv. 0022-…).",
        "Open de slip en controleer dat hij klopt: bedrag, datum, naam van de afzender.",
        "Alles klopt → druk op Verify en bevestig. De klant krijgt een melding en ziet het geld.",
        "Nog niet op de bank → laat hem op Pending staan. Kijk later opnieuw. NIET verifiëren op alleen de slip.",
        "Verkeerd bedrag, verkeerde valuta, of niet van ons → Reject, met een reden die de klant begrijpt (hoofdstuk 5).",
      ],
    },
    watch: {
      en: [
        "Amount on the bank is different from the request? Do not verify. Ask the customer, or ask an owner.",
        "Two top-ups with the same amount from the same customer? Match by reference, never by guessing.",
      ],
      nl: [
        "Bedrag op de bank anders dan de aanvraag? Niet verifiëren. Vraag het de klant, of een eigenaar.",
        "Twee top-ups met hetzelfde bedrag van dezelfde klant? Koppel op referentie, nooit op gevoel.",
      ],
    },
  },
  {
    id: "reject",
    icon: "x",
    title: { en: "5. Rejecting — always with a reason", nl: "5. Afwijzen — altijd met een reden" },
    what: {
      en: "Every queue has a Reject button. Rejecting asks for a reason. The customer reads that reason in the app.",
      nl: "Elke wachtrij heeft een Reject-knop. Afwijzen vraagt om een reden. De klant leest die reden in de app.",
    },
    why: {
      en: "A rejection without a reason creates a WhatsApp message, a call, and an angry customer. A clear reason tells them exactly what to do next.",
      nl: "Een afwijzing zonder reden levert een WhatsApp-bericht, een telefoontje en een boze klant op. Een duidelijke reden zegt precies wat ze nu moeten doen.",
    },
    how: {
      en: [
        "Press Reject.",
        "Pick a ready-made reason if one fits, or write one.",
        "Write it for the customer: what is wrong AND what to do. Example: “We received €450, not €500. Please upload a new top-up for €450.”",
        "Confirm. The customer is notified.",
      ],
      nl: [
        "Druk op Reject.",
        "Kies een kant-en-klare reden als die past, of schrijf er een.",
        "Schrijf hem voor de klant: wat er mis is EN wat ze moeten doen. Voorbeeld: “We ontvingen €450, niet €500. Maak een nieuwe top-up aan van €450.”",
        "Bevestig. De klant krijgt een melding.",
      ],
    },
  },
  {
    id: "requests",
    icon: "file",
    where: "Customers › Account Requests",
    title: { en: "6. Ad-account requests", nl: "6. Ad-account aanvragen" },
    what: {
      en: "A customer asks for a new ad account (for example a Meta account). Depending on their plan, the first accounts are included; an extra one costs €50, taken from their wallet when they ask.",
      nl: "Een klant vraagt een nieuw ad account aan (bijvoorbeeld een Meta-account). Afhankelijk van hun plan zitten de eerste accounts erbij; een extra kost €50, van hun wallet gehaald bij de aanvraag.",
    },
    why: {
      en: "Without an ad account a customer cannot advertise — and cannot spend. A fast setup is the best customer service we have.",
      nl: "Zonder ad account kan een klant niet adverteren — en niets uitgeven. Snel klaarzetten is de beste klantenservice die we hebben.",
    },
    how: {
      en: [
        "Open Customers › Account Requests. Pending ones are at the top.",
        "Press Review on the oldest. Read what they asked for (platform, name, details).",
        "Set the account up with the platform.",
        "Press Create ad account and fill in the account details. The customer sees the account appear.",
        "Cannot do it? Reject with a reason (chapter 5).",
      ],
      nl: [
        "Open Customers › Account Requests. De Pending-aanvragen staan bovenaan.",
        "Druk op Review bij de oudste. Lees wat ze vroegen (platform, naam, details).",
        "Zet het account klaar bij het platform.",
        "Druk op Create ad account en vul de gegevens van het account in. De klant ziet het account verschijnen.",
        "Lukt het niet? Reject met een reden (hoofdstuk 5).",
      ],
    },
  },
  {
    id: "adtopups",
    icon: "coins",
    where: "Money › Ad-account Topups",
    title: { en: "7. Ad-account top-ups (where the fee is taken)", nl: "7. Ad-account top-ups (waar de fee afgaat)" },
    what: {
      en: "A customer moves money from their wallet onto one of their ad accounts. You check it and verify. The fee of their plan is taken off here; the rest goes onto the ad account.",
      nl: "Een klant zet geld van zijn wallet op een van zijn ad accounts. Jij controleert en verifieert. Hier gaat de fee van hun plan eraf; de rest gaat op het ad account.",
    },
    why: {
      en: "This is where we earn our fee, and where the customer's advertising budget becomes real. A wrong figure here costs us or the customer money.",
      nl: "Hier verdienen wij onze fee, en hier wordt het advertentiebudget van de klant echt. Een verkeerd bedrag kost ons of de klant geld.",
    },
    how: {
      en: [
        "Open Money › Ad-account Topups. Pending ones first.",
        "Press Verify on the oldest. You see: amount, fee %, and what lands on the ad account.",
        "Leave the fee as it is — it comes from their plan. Only an owner decides on a different fee.",
        "Put the money on the ad account with the platform (for accounts that are not automatic).",
        "Press Verify Payment. Done.",
      ],
      nl: [
        "Open Money › Ad-account Topups. Eerst de Pending.",
        "Druk op Verify bij de oudste. Je ziet: bedrag, fee %, en wat er op het ad account komt.",
        "Laat de fee staan — die komt uit hun plan. Alleen een eigenaar beslist over een andere fee.",
        "Zet het geld op het ad account bij het platform (bij accounts die niet automatisch gaan).",
        "Druk op Verify Payment. Klaar.",
      ],
    },
    watch: {
      en: ["Never tell a customer what the platform charges us or what our margin is. They know their own fee — that is all."],
      nl: ["Vertel een klant nooit wat het platform ons rekent of wat onze marge is. Ze kennen hun eigen fee — dat is alles."],
    },
  },
  {
    id: "withdrawals",
    icon: "download",
    where: "Money › Withdrawals",
    title: { en: "8. Money back from an ad account", nl: "8. Geld terug van een ad account" },
    what: {
      en: "A customer asks to take unspent money off an ad account and back into their wallet. An admin checks and approves it.",
      nl: "Een klant vraagt om ongebruikt geld van een ad account terug te zetten in zijn wallet. Een admin controleert en keurt goed.",
    },
    why: {
      en: "The money must really be off the ad account before it goes back into the wallet — otherwise it exists twice.",
      nl: "Het geld moet echt van het ad account af zijn voordat het terug in de wallet gaat — anders bestaat het twee keer.",
    },
    how: {
      en: [
        "Open Money › Withdrawals.",
        "Open the request. Check with the platform that the amount is really available on that ad account.",
        "Take the money off the ad account with the platform.",
        "Approve. The wallet is credited.",
        "Not possible (money already spent)? Reject with a reason.",
      ],
      nl: [
        "Open Money › Withdrawals.",
        "Open de aanvraag. Controleer bij het platform dat het bedrag echt beschikbaar is op dat ad account.",
        "Haal het geld van het ad account af bij het platform.",
        "Keur goed (Approve). De wallet wordt bijgeschreven.",
        "Kan niet (geld al uitgegeven)? Reject met een reden.",
      ],
    },
    watch: {
      en: ["Customers can NOT take money from their wallet to their bank themselves — only from an ad account back to the wallet. When a customer leaves for good, an admin can request a refund of the wallet (Money › Withdrawals › Refunds) and an owner approves it."],
      nl: ["Klanten kunnen ZELF geen geld van hun wallet naar hun bank halen — alleen van een ad account terug naar de wallet. Vertrekt een klant definitief, dan kan een admin een terugbetaling van de wallet aanvragen (Money › Withdrawals › Refunds) en keurt een eigenaar die goed."],
    },
  },
  {
    id: "invoices",
    icon: "receipt",
    where: "Money › Invoices",
    title: { en: "9. Monthly invoices", nl: "9. Maandfacturen" },
    what: {
      en: "Every customer has a plan with a monthly price. Each month an invoice is made automatically and emailed with the PDF. The customer pays it with “Pay now” from their wallet. After 7 days it is taken from the wallet automatically if the money is there.",
      nl: "Elke klant heeft een plan met een maandprijs. Elke maand wordt automatisch een factuur gemaakt en gemaild met de pdf. De klant betaalt met “Pay now” uit zijn wallet. Na 7 dagen wordt hij automatisch van de wallet gehaald als het geld er staat.",
    },
    why: {
      en: "The plan pays for the service. An unpaid invoice is a customer who will soon be blocked — better to help them pay in time.",
      nl: "Het plan betaalt de service. Een onbetaalde factuur is een klant die straks geblokkeerd wordt — help ze liever op tijd te betalen.",
    },
    how: {
      en: [
        "Dashboard queue “Invoices past their due date” shows the ones that are late.",
        "Open it and see which customer and how much.",
        "Send the customer a friendly WhatsApp: the amount, and that they can pay with Pay now in the app (Billing), or top up their wallet first.",
      ],
      nl: [
        "De wachtrij “Invoices past their due date” op het Dashboard toont de te late.",
        "Open hem en kijk welke klant en hoeveel.",
        "Stuur de klant een vriendelijk WhatsApp-bericht: het bedrag, en dat ze kunnen betalen met Pay now in de app (Billing), of eerst hun wallet aanvullen.",
      ],
    },
  },
  {
    id: "customers",
    icon: "users",
    where: "Customers › Advertisers",
    title: { en: "10. Finding a customer", nl: "10. Een klant opzoeken" },
    what: {
      en: "Every customer has a client code (PSM0001, PSM0002 …). It is on their dashboard, in every payment reference, and in the name of their WhatsApp group.",
      nl: "Elke klant heeft een klantcode (PSM0001, PSM0002 …). Die staat op hun dashboard, in elke betaalreferentie en in de naam van hun WhatsApp-groep.",
    },
    why: {
      en: "Names are written in many ways; the client code is always the same. Always ask for it, always use it.",
      nl: "Namen worden op veel manieren geschreven; de klantcode is altijd hetzelfde. Vraag er altijd om, gebruik hem altijd.",
    },
    how: {
      en: [
        "Open Customers › Advertisers.",
        "Type the client code, name or email in the search box.",
        "Click the row to see everything: wallet, ad accounts, top-ups, invoices.",
      ],
      nl: [
        "Open Customers › Advertisers.",
        "Typ de klantcode, naam of e-mail in het zoekveld.",
        "Klik op de rij om alles te zien: wallet, ad accounts, top-ups, facturen.",
      ],
    },
  },
  {
    id: "bank",
    icon: "landmark",
    where: "Bank icon, top right",
    title: { en: "11. Sending bank details", nl: "11. Bankgegevens sturen" },
    what: {
      en: "The bank icon at the top right opens all our bank details: per bank and per currency, each detail copies with one click, plus a ready-made WhatsApp message.",
      nl: "Het bankicoon rechtsboven opent al onze bankgegevens: per bank en per valuta, elk gegeven kopieer je met één klik, plus een kant-en-klaar WhatsApp-bericht.",
    },
    why: {
      en: "Typing an account number by hand is how money goes to the wrong place. Always copy from the app.",
      nl: "Een rekeningnummer overtypen is hoe geld op de verkeerde plek belandt. Kopieer altijd uit de app.",
    },
    how: {
      en: [
        "Press the bank icon.",
        "Pick the bank the customer pays to, then the currency they send.",
        "Pick the customer (optional) — their name and code go into the message.",
        "Press Open WhatsApp (or Copy message) and send it.",
      ],
      nl: [
        "Druk op het bankicoon.",
        "Kies de bank waar de klant naartoe betaalt, en dan de valuta die ze sturen.",
        "Kies de klant (mag ook niet) — hun naam en code komen in het bericht.",
        "Druk op Open WhatsApp (of Copy message) en verstuur het.",
      ],
    },
    watch: {
      en: ["Not sure which bank a customer pays to? Their own Top up screen in the app shows it. Ask an owner if in doubt."],
      nl: ["Twijfel welke bank een klant moet gebruiken? Hun eigen Top up-scherm in de app laat het zien. Vraag een eigenaar bij twijfel."],
    },
  },
  {
    id: "schedule",
    icon: "calendar",
    where: "More › Schedule",
    title: { en: "12. The schedule", nl: "12. Het rooster" },
    what: {
      en: "Who works when. Each week has morning and late shifts. The Dashboard shows who is on right now.",
      nl: "Wie werkt wanneer. Elke week heeft ochtend- en late diensten. Het Dashboard laat zien wie er nu dienst heeft.",
    },
    why: {
      en: "Customers expect an answer during our hours. The schedule makes sure someone is always on.",
      nl: "Klanten verwachten antwoord tijdens onze uren. Het rooster zorgt dat er altijd iemand is.",
    },
    how: {
      en: [
        "Open More › Schedule to see your shifts.",
        "Fill in My preferences: the days you can work, morning/late/full day, and how many days a week. Save.",
        "The schedule maker uses your preferences. Once a period is locked, only an owner can change it — ask in time.",
      ],
      nl: [
        "Open More › Schedule om je diensten te zien.",
        "Vul My preferences in: de dagen dat je kunt, ochtend/laat/hele dag, en hoeveel dagen per week. Opslaan.",
        "De roostermaker gebruikt jouw voorkeuren. Staat een periode vast, dan kan alleen een eigenaar nog wijzigen — vraag het op tijd.",
      ],
    },
  },
  {
    id: "rules",
    icon: "shield",
    title: { en: "13. The golden rules", nl: "13. De gouden regels" },
    what: {
      en: "Six rules. Every mistake that ever cost us money broke one of them.",
      nl: "Zes regels. Elke fout die ons ooit geld kostte, brak er een van.",
    },
    why: {
      en: "Everything you do in the app is logged with your name. These rules protect the customers, the company — and you.",
      nl: "Alles wat je in de app doet wordt gelogd met jouw naam. Deze regels beschermen de klanten, het bedrijf — en jou.",
    },
    how: {
      en: [
        "Never verify money you have not seen on our bank.",
        "Never reject without a reason the customer understands.",
        "Never tell a customer the name of our supplier, what we pay, or our margin.",
        "Never share your login. Never ask a customer for their password.",
        "If the app and the bank disagree: stop, do nothing, ask an owner.",
        "Not sure? Ask. A question costs a minute; a wrong click can cost thousands.",
      ],
      nl: [
        "Verifieer nooit geld dat je niet op onze bank hebt gezien.",
        "Wijs nooit af zonder een reden die de klant begrijpt.",
        "Vertel een klant nooit de naam van onze leverancier, wat wij betalen, of onze marge.",
        "Deel nooit je login. Vraag een klant nooit om zijn wachtwoord.",
        "Zijn de app en de bank het niet eens: stop, doe niets, vraag een eigenaar.",
        "Twijfel? Vraag het. Een vraag kost een minuut; een verkeerde klik kan duizenden kosten.",
      ],
    },
  },
  {
    id: "help",
    icon: "help",
    title: { en: "14. Stuck? How to ask for help", nl: "14. Vast? Zo vraag je om hulp" },
    what: {
      en: "The owners decide on anything unusual: different fees, money that does not match, angry customers, errors in the app.",
      nl: "De eigenaars beslissen over alles wat ongewoon is: andere fees, geld dat niet klopt, boze klanten, fouten in de app.",
    },
    why: {
      en: "A good question gets a fast answer. A vague one gets three questions back.",
      nl: "Een goede vraag krijgt snel antwoord. Een vage vraag krijgt drie vragen terug.",
    },
    how: {
      en: [
        "Always give: the client code, what you see (a screenshot), and what you expected.",
        "Example: “PSM0022 — top-up €500 pending, bank shows €450 from the same name. Verify, reject, or ask the customer?”",
        "Error message in the app? Screenshot it, including the top of the screen.",
      ],
      nl: [
        "Geef altijd: de klantcode, wat je ziet (een screenshot), en wat je verwachtte.",
        "Voorbeeld: “PSM0022 — top-up €500 pending, bank toont €450 van dezelfde naam. Verifiëren, afwijzen, of klant vragen?”",
        "Foutmelding in de app? Maak een screenshot, met de bovenkant van het scherm erbij.",
      ],
    },
  },
  // ── ALLEEN EIGENAARS ────────────────────────────────────────────────
  {
    id: "own-invite",
    icon: "mail",
    owner: true,
    where: "Dashboard › New invite",
    title: { en: "15. Inviting a new customer", nl: "15. Een nieuwe klant uitnodigen" },
    what: {
      en: "You invite a customer by email with their plan, fee, referrer and bank. The client code is reserved the moment you create the invite.",
      nl: "Je nodigt een klant uit per e-mail met hun plan, fee, referrer en bank. De klantcode ligt vast zodra je de uitnodiging maakt.",
    },
    why: {
      en: "Everything the customer pays is decided here. Getting it right at the start avoids corrections later.",
      nl: "Alles wat de klant betaalt wordt hier bepaald. Het meteen goed doen voorkomt correcties later.",
    },
    how: {
      en: [
        "Press New invite on the Dashboard.",
        "Fill in the email, the role, the plan or community, and the bank the customer will pay to.",
        "Create. You see the reserved client code — name the WhatsApp group after it straight away.",
        "Send the link by email, or copy the ready-made WhatsApp message.",
      ],
      nl: [
        "Druk op New invite op het Dashboard.",
        "Vul het e-mailadres, de rol, het plan of de community, en de bank waar de klant naartoe betaalt in.",
        "Aanmaken. Je ziet de gereserveerde klantcode — noem de WhatsApp-groep er meteen naar.",
        "Stuur de link per e-mail, of kopieer het kant-en-klare WhatsApp-bericht.",
      ],
    },
  },
  {
    id: "own-plans",
    icon: "settings",
    owner: true,
    where: "Owner › Settings › Plans & Communities",
    title: { en: "16. Plans, communities and fees", nl: "16. Plannen, communities en fees" },
    what: {
      en: "A plan (tier) or community sets the monthly price, the included ad accounts and the top-up fee. Each card also switches the affiliate program on or off for everyone on it.",
      nl: "Een plan (tier) of community bepaalt de maandprijs, de inbegrepen ad accounts en de top-up fee. Op elke kaart zet je ook het affiliateprogramma aan of uit voor iedereen erop.",
    },
    why: {
      en: "Pricing in one place: change it here and every new invite uses it.",
      nl: "Prijzen op één plek: verander het hier en elke nieuwe uitnodiging gebruikt het.",
    },
    how: {
      en: [
        "Open Settings › Plans & Communities.",
        "Change the figures on a card and press Save.",
        "Affiliate program On/Off saves at once.",
      ],
      nl: [
        "Open Settings › Plans & Communities.",
        "Pas de bedragen op een kaart aan en druk op Save.",
        "Affiliate program On/Off slaat meteen op.",
      ],
    },
  },
  {
    id: "own-supplier",
    icon: "scale",
    owner: true,
    where: "Owner › Supplier balance",
    title: { en: "17. Supplier balance and corrections", nl: "17. Leverancierssaldo en correcties" },
    what: {
      en: "For a supplier without an automatic link we keep the balance ourselves: what we sent, client top-ups, fees, tax — against the balance their dashboard shows.",
      nl: "Voor een leverancier zonder automatische koppeling houden we het saldo zelf bij: wat we stuurden, klant-top-ups, fees, belasting — tegen het saldo dat hun dashboard toont.",
    },
    why: {
      en: "If our figure and theirs differ, money is missing somewhere. Daily checking catches it while it is small.",
      nl: "Verschillen ons cijfer en dat van hen, dan mist er ergens geld. Dagelijks controleren vangt het terwijl het klein is.",
    },
    how: {
      en: [
        "Press Add entry, pick what it is (We sent, Client top-up, Fee, DST, Correction), the day, the amount and the client.",
        "Press End balance and type what their dashboard shows. The difference appears at once.",
        "Corrections from an admin wait at the top until a super admin presses Approve or Reject.",
      ],
      nl: [
        "Druk op Add entry, kies wat het is (We sent, Client top-up, Fee, DST, Correction), de dag, het bedrag en de klant.",
        "Druk op End balance en typ wat hun dashboard toont. Het verschil verschijnt meteen.",
        "Correcties van een admin wachten bovenaan tot een super admin op Approve of Reject drukt.",
      ],
    },
  },
  {
    id: "own-admins",
    icon: "key",
    owner: true,
    where: "Owner › Admins · More › Schedule",
    title: { en: "18. Admins, rights, schedule and hours", nl: "18. Admins, rechten, rooster en uren" },
    what: {
      en: "You decide who is an admin, what each admin may do, who makes the schedule, and who may see everyone's hours.",
      nl: "Jij bepaalt wie admin is, wat elke admin mag, wie het rooster maakt, en wie de uren van iedereen mag zien.",
    },
    why: {
      en: "An employee needs enough rights to work, and no more. Hours show who carried the work.",
      nl: "Een medewerker heeft genoeg rechten nodig om te werken, en niet meer. De uren laten zien wie het werk droeg.",
    },
    how: {
      en: [
        "Owner › Admins: add an admin and switch their rights on or off.",
        "More › Schedule › Schedule settings: choose the schedule maker and who sees hours; lock the schedule until a date.",
        "Hours this week (on the same page): active time, planned time and number of actions per admin.",
      ],
      nl: [
        "Owner › Admins: voeg een admin toe en zet hun rechten aan of uit.",
        "More › Schedule › Schedule settings: kies de roostermaker en wie de uren ziet; zet het rooster vast tot een datum.",
        "Hours this week (op dezelfde pagina): actieve tijd, geplande tijd en aantal acties per admin.",
      ],
    },
  },
];

export const HB_GLOSSARY: { term: string; def: T }[] = [
  { term: "Client code", def: { en: "The customer's number, like PSM0022. Use it everywhere.", nl: "Het nummer van de klant, zoals PSM0022. Gebruik het overal." } },
  { term: "Wallet", def: { en: "The customer's balance in the app, in EUR and USD. Money comes in by bank transfer.", nl: "Het saldo van de klant in de app, in EUR en USD. Geld komt binnen per bankoverschrijving." } },
  { term: "Wallet top-up", def: { en: "Money from the customer's bank into their wallet. You verify it.", nl: "Geld van de bank van de klant naar zijn wallet. Jij verifieert het." } },
  { term: "Ad account", def: { en: "An advertising account on Meta, Google, TikTok … that the customer advertises with.", nl: "Een account om mee te adverteren, op Meta, Google, TikTok …" } },
  { term: "Ad-account top-up", def: { en: "Money from the wallet onto an ad account. The fee is taken here.", nl: "Geld van de wallet op een ad account. Hier gaat de fee af." } },
  { term: "Slip", def: { en: "The payment proof the customer uploads. A picture — not money.", nl: "Het betaalbewijs dat de klant uploadt. Een plaatje — geen geld." } },
  { term: "Reference", def: { en: "The code the customer puts on the transfer, like 0022-1234. It links the bank payment to the top-up.", nl: "De code die de klant bij de overschrijving zet, zoals 0022-1234. Die koppelt de bankbetaling aan de top-up." } },
  { term: "Fee", def: { en: "Our percentage on an ad-account top-up. It comes from the customer's plan.", nl: "Ons percentage op een ad-account top-up. Komt uit het plan van de klant." } },
  { term: "Plan / Community", def: { en: "The package a customer is on: monthly price, included accounts, fee.", nl: "Het pakket van een klant: maandprijs, inbegrepen accounts, fee." } },
  { term: "DST", def: { en: "Digital services tax that some countries charge on ad spend. Passed on to the customer.", nl: "Digitale-dienstenbelasting die sommige landen op advertentie-uitgaven heffen. Wordt doorberekend aan de klant." } },
  { term: "Affiliate", def: { en: "Someone who brings in customers and earns commission on them.", nl: "Iemand die klanten aanbrengt en daar commissie op verdient." } },
  { term: "Verify / Reject", def: { en: "Approve after checking / refuse with a reason. Both are logged with your name.", nl: "Goedkeuren na controle / weigeren met een reden. Allebei gelogd met jouw naam." } },
];

/** Alle tekst van een hoofdstuk in een taal, voor zoeken en vertalen. */
export function chapterText(c: HbChapter, lang: HbLang): string[] {
  return [c.title[lang], c.what[lang], c.why[lang], ...c.how[lang], ...(c.watch?.[lang] ?? [])];
}
