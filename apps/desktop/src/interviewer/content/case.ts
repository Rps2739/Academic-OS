import type { CaseQuestion } from "./types";

export const CASES: CaseQuestion[] = [
  {
    kind: "case",
    id: "case-01",
    section: "case",
    title: "Profitability — a café chain's falling margins",
    prompt: "Your client runs 40 cafés across Bengaluru and Pune. Revenue grew 12% last year, but operating profit fell by a third. The founder wants to know why, and what to do in the next six months.",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Useful clarifications: How is 'operating profit' defined (before or after head-office costs)? Did the store count change — how many new cafés opened, and when? Is the fall across all cafés or concentrated in some? Any changes in pricing, menu, delivery-app share, or rent terms? What's the goal — restore margin to last year's level, or a specific target?",
        checklist: ["Defines the metric", "Asks about store count / new openings", "Asks where the decline is concentrated", "Asks about price, mix or channel changes", "Confirms the objective and timeline"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Profit = Revenue − Costs. Revenue: number of cafés × orders per café × average order value, split by channel (dine-in vs delivery apps, where commission eats margin). Costs: variable (ingredients, packaging, app commissions) and fixed (rent, staff, utilities), plus one-off costs of new openings. Compare mature cafés with new ones separately so that growth doesn't hide a margin problem.",
        checklist: ["Profit = revenue − cost", "Revenue drivers split (stores × orders × AOV)", "Channel split (delivery commission)", "Fixed vs variable costs", "Separates new from mature stores"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Last year vs this year (all cafés)",
            columns: ["Metric", "Last year", "This year"],
            rows: [["Cafés open (year end)", 30, 40], ["Delivery share of orders", "22%", "41%"], ["Avg delivery commission", "24%", "26%"], ["Rent per café (₹ lakh / yr)", 18, 21]],
          },
        ],
        model: "Two things drive the fall. First, delivery nearly doubled as a share of orders while commission rose to 26%, so a large slice of revenue now carries a heavy cost — revenue grows while margin shrinks. Second, ten new cafés at higher rent haven't matured yet. The growth masked a mix shift towards low-margin orders.",
        checklist: ["Spots the delivery-mix shift", "Quantifies commission impact roughly", "Notes new-store drag and higher rent", "Separates growth from profitability"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Recommend three moves: (1) price delivery menus 8–10% above dine-in and push a direct-order channel with a loyalty discount, to claw back commission; (2) pause new openings for six months and fix the ten newest cafés — renegotiate or exit the worst two on rent; (3) track contribution margin by channel monthly. Risk: delivery price rises may cut volume, so pilot in five cafés first.",
        checklist: ["Leads with the answer", "2–3 concrete actions tied to the analysis", "Mentions a risk or next step", "Gives a timeline"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-02",
    section: "case",
    title: "Market entry — a D2C skincare brand going into tier-2 cities",
    prompt: "A direct-to-consumer skincare brand sells online in the top 8 metros with ₹120 crore revenue. The founders are considering entering tier-2 cities (population 10–40 lakh). Should they, and how?",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Clarify: What is the goal (revenue, brand reach, profit)? What is the budget and timeline? Which tier-2 cities are in scope? What do they sell today and at what price? Online only, or would they open stores or use distributors? What do existing customers in tier-2 cities already buy online? Any capacity constraints in supply chain?",
        checklist: ["Asks about the objective and budget", "Defines which cities and products", "Asks about channel options", "Asks about existing tier-2 demand", "Checks capacity and constraints"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Decide with four blocks: (1) Market attractiveness — size, growth, spending on skincare, online penetration. (2) Customer fit — do tier-2 customers want the same products, at the same price, with the same awareness? (3) Ability to win — competition, distribution, delivery cost and returns, marketing cost per customer. (4) Economics — customer acquisition cost, order value, repeat rate, break-even. Then compare entry routes: online-only, marketplaces, or retail partners.",
        checklist: ["Market size and growth", "Customer fit", "Competition and ability to win", "Unit economics / break-even", "Entry options compared"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Online vs tier-2 snapshot (per customer)",
            columns: ["Metric", "Metro (today)", "Tier-2 (estimate)"],
            rows: [["Average order value (₹)", 1100, 700], ["Cost to acquire a customer (₹)", 450, 380], ["Delivery + returns cost per order (₹)", 90, 150], ["Gross margin before delivery", "62%", "58%"], ["Repeat purchase within a year", "40%", "22%"]],
          },
        ],
        model: "The tier-2 order is worth less and costs more to deliver, and repeat is lower. Metro first-order contribution ≈ 1100 × 0.62 − 90 = ₹592 against CAC ₹450: positive. Tier-2 ≈ 700 × 0.58 − 150 = ₹256 against ₹380: negative on the first order, and with low repeat it may never pay back. Only a smaller price point, cheaper delivery, or a retail partner could change that.",
        checklist: ["Computes contribution per order for both", "Compares with acquisition cost", "Notes repeat rate effect", "Does not rely only on market size", "Suggests what must change"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Don't launch broadly. Run a 3-month pilot in two cities with a smaller pack (₹300–400), a pin-code-based delivery partner, and a retail partnership for trial. Set go/no-go gates: first-order contribution ≥ CAC and 30% repeat in 6 months. If met, scale to 8 cities. Risk: brand dilution from lower prices; mitigate with a distinct pack.",
        checklist: ["Clear yes/no/conditional recommendation", "Pilot with success criteria", "Addresses the economics found", "Mentions a risk"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-03",
    section: "case",
    title: "Pricing — an electric-scooter subscription",
    prompt: "An EV start-up wants to launch a monthly subscription for its electric scooter instead of selling it outright. How should it price the subscription?",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: What is the scooter's cost (manufacturing, battery) and the current selling price? Who is the target customer (gig workers, commuters, students)? What does the subscription include (insurance, maintenance, battery swap)? What contract length? What are competitors charging for rentals or leases? What is the company's goal — volume or margin? How does it fund the vehicles?",
        checklist: ["Asks about costs and current price", "Defines the customer segment", "Clarifies what the subscription includes", "Competitor / alternative pricing", "Business goal and funding"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Use three lenses: cost-based (cover vehicle cost, battery, insurance, servicing, financing and a margin over the contract life), customer value-based (what the customer saves versus petrol scooter, rent or owning), and competitor-based. Then test the subscription structure: monthly fee, deposit, tenure discounts, and what happens at the end. Check the unit economics over the vehicle's life, including residual value.",
        checklist: ["Cost-based pricing", "Customer-value-based pricing", "Competitor benchmark", "Contract structure (deposit, tenure)", "Lifetime unit economics"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Per-scooter economics (36-month plan)",
            columns: ["Item", "Value"],
            rows: [["Vehicle + battery cost (₹)", 105000], ["Insurance + servicing per month (₹)", 600], ["Financing cost, total (₹)", 12000], ["Residual value after 36 months (₹)", 30000], ["Petrol scooter running cost saved per month (₹)", 1800], ["Rental scooter price in the market per month (₹)", 3500]],
          },
        ],
        model: "Total cost over 36 months = 105,000 + 12,000 + 600 × 36 (21,600) = ₹1,38,600, less ₹30,000 residual = ₹1,08,600 net, i.e. ₹3,017 a month to break even. A 15% margin suggests ~₹3,470 a month. The rental market is ₹3,500, so there is little room above cost. The customer's saving of ₹1,800 is the value argument: a monthly fee near ₹3,300–3,500 competes with rentals only if service is better. Residual value is the biggest sensitivity.",
        checklist: ["Computes the break-even monthly fee", "Adds a margin and compares with the rental price", "Uses the customer saving as a value argument", "Identifies residual value as the key risk"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Launch at ₹3,299 a month with a ₹3,000 refundable deposit and a 36-month term, with a 10% discount for 24-month commitments. Include insurance and servicing as the differentiator. Protect against residual-value risk with a buy-back clause and battery health monitoring. Review pricing after 500 subscribers.",
        checklist: ["A specific price with rationale", "Structure of the offer", "Mitigates the biggest risk", "Next step / review point"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-04",
    section: "case",
    title: "Growth — a regional bank's credit-card uptake",
    prompt: "A regional bank with 40 lakh customers has issued only 1.2 lakh credit cards. The CEO wants to double card customers in two years. What would you do?",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: What is the current active-card rate (cards that are used monthly)? What is the target customer profile and credit-risk appetite? What channels exist (branches, app, telesales)? What are competitors offering? What are the economics of a card (interchange, interest, fees) and the loss rate? Any regulatory or capital constraints?",
        checklist: ["Active vs issued cards", "Target segment and risk appetite", "Channels", "Card economics", "Constraints"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Cards = eligible customers × offer rate × acceptance × activation. Break down the funnel to find the leak: how many customers qualify, are offered, apply, get approved, activate, and use the card. Then consider levers: pre-approved offers to salaried customers, app-based onboarding, co-branded cards, rewards. Also check profitability by segment so that growth does not create bad loans.",
        checklist: ["Funnel structure", "Identifies the leak", "Growth levers", "Risk and profitability", "Prioritisation"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Card funnel (last 12 months)",
            columns: ["Stage", "Customers"],
            rows: [["Eligible customers (salaried, good history)", 800000], ["Offered a card", 160000], ["Applied", 40000], ["Approved", 28000], ["Activated within 30 days", 16800]],
          },
        ],
        model: "Only 20% of eligible customers are offered a card, which is the biggest drop. After the offer, application is 25%, approval 70%, activation 60%. If the bank doubles the offer rate to 40% with the same conversions, cards from this pool double. Fixing activation from 60% to 75% adds a further 25% on top. So reach is the first problem, activation second.",
        checklist: ["Computes conversion at each stage", "Finds the biggest drop-off", "Quantifies the impact of fixing it", "Mentions activation"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Priority one: pre-approved offers in the app and at branches to the 6.4 lakh eligible customers not yet offered, using existing data. Priority two: simplify the application and give a joining benefit that triggers first use in 30 days. Priority three: add a co-brand with a local retailer. Track activation and early delinquency monthly as guardrails. Expect to reach the target in 18–24 months.",
        checklist: ["Prioritised actions", "Tied to the funnel numbers", "Risk guardrails", "Timeline"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-05",
    section: "case",
    title: "M&A — a quick-commerce player buying a dark-store operator",
    prompt: "A quick-commerce company is considering acquiring a company that operates 120 dark stores across five cities for ₹600 crore. Should it?",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: Why does the buyer want it — speed, locations, technology or talent? What is the target's revenue, margin and cash burn? Do the stores overlap with the buyer's? Is the lease and staff transferable? Are there other ways (build own, partner)? What is the buyer's financial headroom and timeline?",
        checklist: ["Strategic rationale", "Target financials", "Overlap with buyer", "Alternatives to buying", "Buyer's capacity"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Evaluate in four parts: strategic fit (does it fill a gap, how much faster than building), standalone value (store-level economics and growth), synergies (shared inventory, procurement, delivery, closing duplicate stores), and risks (integration, leases, regulation, key staff). Compare the price against the cost to build the same footprint and against the value of the cash flows.",
        checklist: ["Strategic fit", "Standalone value", "Synergies", "Risks and integration", "Price vs build alternative"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Target vs build-your-own",
            columns: ["Metric", "Target", "Build own (120 stores)"],
            rows: [["Cost per dark store, set up (₹ lakh)", "—", 60], ["Annual revenue per store (₹ crore)", 5.5, 3.0], ["Store-level margin", "4%", "−2% in year 1"], ["Time to reach 120 stores (months)", 0, 24], ["Purchase price (₹ crore)", 600, 72]],
          },
        ],
        model: "Building 120 stores would cost about ₹72 crore plus losses, versus ₹600 crore to buy — a ₹500 crore premium. What does the premium buy? Speed (24 months), mature stores at ₹5.5 crore revenue each (₹660 crore total) with positive margins, and staff. At 4% margin the target earns ₹26 crore a year, a very long payback on ₹600 crore unless synergies of ₹30–40 crore are found. At this price the deal does not pay on standalone numbers.",
        checklist: ["Compares price to cost-to-build", "Computes the target's earnings and payback", "Considers what the premium buys", "Mentions synergies needed"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Don't proceed at ₹600 crore. Counter at ₹300–350 crore, or buy only the best 50–60 stores in cities where the buyer is weak. Condition the deal on synergies identified in due diligence (procurement, overlapping stores), key-staff retention, and lease transferability. Otherwise, build in the target cities and use the savings to fund customer acquisition.",
        checklist: ["Clear recommendation", "Alternative structure or price", "Conditions", "Considers building instead"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-06",
    section: "case",
    title: "Operations — a hospital's long OPD waiting times",
    prompt: "A 400-bed private hospital's outpatient department (OPD) has an average waiting time of 70 minutes. Patient complaints are rising. How would you reduce it?",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: Where does the waiting happen — registration, doctor consultation, billing, tests? Is the target a specific wait (say 30 minutes)? When is it worst (time of day, day of week)? Which departments? How are appointments scheduled? What are the staffing and room constraints? How do patients arrive: appointment vs walk-in?",
        checklist: ["Locates the wait in the journey", "Defines the target", "Asks when and where it's worst", "Asks about scheduling", "Constraints"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Map the patient journey: arrival, registration, vitals, consultation, tests, billing, pharmacy. For each step measure the wait and the cause: demand (arrival pattern), capacity (doctors, rooms, staff) and process (forms, handoffs). Use queueing logic: waiting grows when arrivals bunch up or consultation time varies. Levers: smoothing the schedule, parallelising steps, adding capacity at the bottleneck, and digitising registration.",
        checklist: ["Journey map", "Demand vs capacity vs process", "Bottleneck thinking", "Levers", "Measurement"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Average time per step (minutes)",
            columns: ["Step", "Wait", "Service time"],
            rows: [["Registration", 18, 4], ["Vitals check", 8, 3], ["Doctor consultation", 35, 9], ["Billing", 9, 3]],
          },
        ],
        model: "Total wait = 70 minutes; doctor consultation accounts for 35 of them (50%), then registration at 18. The doctors' service time is only 9 minutes, so the wait is mostly queueing, which suggests bunched arrivals (most appointments booked at 9–11 am) rather than slow doctors. Registration queueing can be removed by pre-registration. Billing and vitals are minor.",
        checklist: ["Finds consultation as the main wait", "Separates wait from service time", "Hypothesises bunching of arrivals", "Spots registration as a quick win"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Three moves: (1) stagger appointment slots across the day using the demand data, and cap bookings per 15-minute slot; (2) shift registration to an app/kiosk before arrival, saving ~15 minutes; (3) have a nurse do vitals and history while patients wait, so doctor time is spent only on consultation. Target 35 minutes in three months. Track the wait by step weekly and survey patients.",
        checklist: ["Actions tied to the bottleneck", "Quantified target", "Quick win and structural fix", "Measurement plan"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-07",
    section: "case",
    title: "Profitability — a coaching institute",
    prompt: "A coaching institute with 6 centres sees its profit margin fall from 18% to 2% in two years while enrolments are flat. Find the cause and suggest what to do.",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: How is margin defined? What changed in the last two years — fees, faculty pay, rent, new centres, online offerings? Is the decline across all centres or some? What are the batch sizes and utilisation? Any competitor moves? What are the programmes (JEE, NEET, CAT) and their mix?",
        checklist: ["Defines margin", "What changed in two years", "Centre-wise view", "Utilisation / batch size", "Programme mix"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Profit = students × fee − costs. Revenue: students by programme × fee realised (after discounts). Costs: faculty (the largest), rent, marketing, content and admin. Break out per centre and per programme, and check utilisation (seats filled vs capacity). Because enrolments are flat, the problem is in fee realisation or cost growth.",
        checklist: ["Profit tree", "Revenue: volume × realised fee", "Cost categories", "Per-centre and per-programme cut", "Utilisation"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Two years ago vs now (all centres)",
            columns: ["Metric", "2 years ago", "Now"],
            rows: [["Students enrolled", 6000, 6000], ["Average fee realised (₹)", 60000, 55000], ["Faculty cost (₹ crore)", 12.0, 13.2], ["Rent (₹ crore)", 5.4, 6.0], ["Marketing (₹ crore)", 3.0, 4.0], ["All other costs (₹ crore)", 9.1, 9.1]],
          },
        ],
        model: "Revenue fell from ₹36 crore to ₹33 crore because of discounting (fee realised −8%), a ₹3 crore loss. Costs rose too: faculty +10%, rent +11%, marketing +33%, adding ₹2.8 crore. Profit therefore dropped from about ₹6.5 crore (18%) to ₹0.7 crore (2%): roughly half of the ₹5.8 crore fall is lost fee revenue and half is cost growth, with student numbers flat. Marketing grew fastest without lifting enrolments, which is a red flag.",
        checklist: ["Computes the revenue change", "Computes the cost increases", "Splits the profit fall between them", "Notes that volume is flat and marketing did not help"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Plan: (1) cap discounts through approval rules and use early-bird offers rather than blanket discounts, to recover fee realisation; (2) review the faculty pay structure — tie a portion to batch fill and results — and rationalise under-filled batches; (3) test marketing spend by channel and cut what does not convert; (4) renegotiate or consolidate the weakest centre on rent. Target recovering ~8 points of margin in 12 months. Risk: quality drop if faculty pay is cut — protect top teachers.",
        checklist: ["Actions tied to the largest cost lines", "Quantified target", "Risk", "Sequencing"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-08",
    section: "case",
    title: "Market sizing and entry — premium pet food in India",
    prompt: "A multinational pet-food company wants to launch a premium dog-food line in India. Estimate the opportunity and recommend how to enter.",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: What do they mean by 'premium' (price point)? Which cities? What is the company's current presence and capabilities? Goal in terms of revenue and timeline? Channels they are open to (pet stores, e-commerce, vets)? What is their investment capacity?",
        checklist: ["Defines premium and the product", "Geography", "Company capabilities", "Goal and timeline", "Channels"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Size the market top-down or bottom-up: urban households × % owning a dog × % who feed packaged/premium food × annual spend. Then assess competition (existing premium brands, price gaps), channels and consumer behaviour (vet recommendation, online purchase). Finally the economics of entering: product cost and import duties vs local manufacturing, marketing cost, and the time to break-even.",
        checklist: ["Market-size logic", "Competition", "Channels and behaviour", "Entry economics", "Risks"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Estimate inputs",
            columns: ["Input", "Value"],
            rows: [["Urban households in top 8 cities (lakh)", 400], ["Households with a dog", "6%"], ["Of those, feed packaged dog food regularly", "35%"], ["Of those, willing to buy premium", "20%"], ["Annual premium food spend per dog (₹)", 24000]],
          },
        ],
        model: "400 lakh × 6% = 24 lakh dog-owning households; × 35% = 8.4 lakh packaged-food users; × 20% = 1.68 lakh premium buyers. × ₹24,000 = ₹403 crore a year in the top 8 cities. This is the addressable market; a realistic 10% share in three years is about ₹40 crore. Growth comes from pet ownership rising and more people buying packaged food. The market is real but small for a global company, so cost of entry matters.",
        checklist: ["Does the multiplication cleanly", "Gets a rupee figure", "Applies a realistic share", "Comments on size vs company ambition"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Enter via e-commerce and a few specialty pet stores in three cities, with vet partnerships to build trust. Manufacture locally or via a contract manufacturer to avoid import duty. Start with one SKU range at a premium of 30–40% over the current top brand. Budget for a ₹40–50 crore three-year investment; scale to other cities if repeat rates exceed 60%.",
        checklist: ["Entry route and sequencing", "Pricing / product stance", "Investment and gates", "Risk"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-09",
    section: "case",
    title: "New product — a UPI-based savings feature",
    prompt: "A popular UPI payments app with 8 crore users wants to launch a feature that helps users save small amounts automatically. Should it, and how should it be designed?",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: What is the objective — engagement, revenue, or deeper financial services? Who are the target users? Where would the money be held (partner bank, mutual fund)? What are the regulatory constraints? How will the company make money? What do competitors offer? How much can it spend?",
        checklist: ["Objective", "Target users", "Where money is held and regulation", "Revenue model", "Competitors and budget"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Assess in four parts: user need (do users want to save, what stops them), proposition (round-up, goal-based or recurring savings, where the money sits), economics (revenue per user via commission or interest spread vs acquisition and compliance cost), and risks (trust, regulation, abuse). Define the test plan with a minimum viable version.",
        checklist: ["User need", "Proposition design", "Economics", "Risks and regulation", "Test plan"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Pilot assumptions per 100 users",
            columns: ["Metric", "Value"],
            rows: [["Users who try the feature", 20], ["Of those, still saving after 3 months", 9], ["Average saved per active user per month (₹)", 600], ["Platform earnings, % of balance per year", "1.0%"], ["Cost to serve per active user per year (₹)", 40]],
          },
        ],
        model: "Out of 100 users, 9 stay active. Their annual saved balance is about 9 × ₹600 × 12 = ₹64,800, and 1% of that is ~₹650 earned a year across them — about ₹72 per active user, against ₹40 cost to serve. Margin is thin, and balances build over time, so revenue improves each year. The bigger value could be engagement and retention. The feature is not a big earner at first and is strategic.",
        checklist: ["Computes the funnel", "Computes earning vs cost per active user", "Notes the balance builds over time", "Distinguishes strategic vs financial value"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Build it, but as a small pilot: round-up savings into a regulated liquid mutual fund via a partner, with a clear 'withdraw anytime' promise. Launch to 10 lakh users, aim for 40% three-month retention, and judge it on engagement and balances rather than immediate revenue. Don't promise returns and keep disclosures clear. Review after six months.",
        checklist: ["Go/no-go with scope", "Success metrics", "Regulatory care", "Timeline"],
      },
    ],
  },
  {
    kind: "case",
    id: "case-10",
    section: "case",
    title: "Turnaround — a mid-size apparel retailer's falling footfall",
    prompt: "A mid-size apparel retail chain with 90 stores has seen footfall fall 18% over two years and same-store sales fall 11%. Management wants a turnaround plan.",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the client before structuring the problem? List your clarifying questions.",
        model: "Ask: Is the fall across all stores or concentrated (location, size, city)? What changed — competitors, online, product range, pricing, store experience? What does the customer profile look like? What are the finances — cash, debt, store-level profit? How much time do they have?",
        checklist: ["Where is the decline concentrated", "What changed in the market and offering", "Customer profile", "Financial position", "Timeline"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model: "Sales = footfall × conversion × basket value. Diagnose each: footfall (location, marketing, mall traffic, online shift), conversion (assortment, stock availability, staff, fitting rooms), basket (price, mix, discounting). Then segment stores into healthy, fixable and structurally weak. The plan has three layers: stop the bleeding (cash and weak stores), fix the core (assortment, pricing), and rebuild growth (online, loyalty).",
        checklist: ["Sales equation", "Diagnoses each driver", "Store segmentation", "Layered plan", "Cash focus"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Store performance split",
            columns: ["Store group", "Stores", "Footfall change", "Store-level profit (₹ crore)"],
            rows: [["Group A — big cities, malls", 35, "−5%", 18], ["Group B — mid-size cities, high streets", 40, "−20%", 3], ["Group C — small towns", 15, "−42%", -9]],
          },
        ],
        model: "The decline isn't uniform. Group A is healthy and profitable (₹18 crore). Group B is fading but still positive. Group C's footfall is down 42% and loses ₹9 crore, cancelling out half of what Group A earns. So the main issue is a weak tail of stores plus drift in mid-size cities, not the whole chain. Next, check whether Group B's fall is a local competition or product-fit problem.",
        checklist: ["Segments the stores", "Quantifies the Group C drag", "Notes Group B as the swing group", "Avoids a chain-wide conclusion"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model: "Phase 1 (0–3 months): close or convert the weakest 10 of the 15 small-town stores, saving ~₹6 crore a year, and cut working capital tied up in slow stock. Phase 2 (3–9 months): refresh the assortment in Group B stores based on local sales data, and fix stock availability for best sellers. Phase 3: build online and a loyalty programme to bring back customers. Track footfall, conversion and cash monthly. Risk: closure costs and morale, so communicate openly.",
        checklist: ["Phased plan", "Quantified benefit", "Metrics to track", "Risk"],
      },
    ],
  },
];
