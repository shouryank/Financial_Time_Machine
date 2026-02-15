<div align="center">

# 🕰️ Financial Time Machine

**Travel back in time to alter your financial history and visualize the ripple effects on your present net worth.**

*AI-driven what-if scenario modeling powered by real bank transaction data.*

</div>

---

## Overview

Financial Time Machine lets you connect your real bank transactions and explore alternate financial timelines. Ask questions like *"What if I had stopped eating out in 2020?"* or *"What if I had invested $500/month in NVIDIA?"* — the AI generates a branching timeline showing exactly how your net worth would differ today.

Inspired by the TVA's multiverse visualizations from *Loki*, the app renders your Prime Timeline alongside divergent scenario branches on an interactive graph.

## ✨ Features

### Core
- **Month-based timeline** spanning your full transaction history (2015–2026)
- **AI scenario engine** (Gemini 2.5 Flash) with 4 what-if patterns:
  - **Pattern A** — Remove recurring spending (e.g. stop subscriptions)
  - **Pattern B** — Add appreciating investment (stocks, crypto, index funds)
  - **Pattern C** — Purchase a depreciating asset (car, equipment)
  - **Pattern D** — One-time expense (medical, legal, travel)
- **Branch-from-branch** — create scenarios off any existing timeline, not just the Prime
- **Investment portfolio tracking** with realistic growth rates by category
- **Net worth calculation** — Cash + Investments + Scenario Assets

### Visualization
- **Multiverse Navigator** — traditional amount-over-time chart with all branches color-coded
- **Time Navigator** — Loki-style flat branching view with Bézier curves (no Y-axis amounts)
- **Clickable nodes** on every branch — click any month dot to open an inline what-if prompt
- **Hover tooltips** showing balance, month label, and branch info
- **Sticky legend** with branch hierarchy codes and color mapping

### Transactions
- **Transactions tab** with full data table of imported bank transactions
- **Category filters** — All / Expenses / Income / Investments
- **Sort** by date, amount, or merchant name (ascending/descending)
- **Search** across merchant names
- **Summary cards** — total amount, transaction count, average per transaction

### Supported Assets
- **20 stocks** with reference prices (NVDA, AAPL, MSFT, GOOGL, AMZN, TSLA, META, etc.)
- **10 cryptocurrencies** with reference prices (BTC, ETH, SOL, DOGE, ADA, etc.)
- Segmented **Stocks / Crypto** toggle panel with quick-tap suggestions

### Banking
- **Plaid Link integration** (Sandbox) — connect a bank account via the official Plaid Link flow
- Link token creation, public token exchange, and disconnect support
- Connection status persisted per user in MongoDB

### UI / UX
- **Light & Dark mode** with sticky floating toggle
- **Profile page** with editable display name, avatar initial, and localStorage persistence
- **Custom Loki-inspired logo** (animated SVG with branching timeline horns)
- **2-row stat cards** (Monthly Income, Monthly Expenses, Savings Rate, Investment Portfolio, Net Worth)
- **Responsive header** — Refresh, Prune, Plaid Link, Profile + Email, Logout

### Auth
- **JWT-based authentication** with HttpOnly cookies
- Signup / Login flow with bcrypt password hashing
- Session auto-restore on page reload
- Per-user transaction isolation

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS (utility classes) |
| **Build** | Vite 6.x with custom middleware plugins |
| **AI** | Google Gemini 2.5 Flash (`@google/genai`) |
| **Database** | MongoDB Atlas (collection: `transactions`, `users`) |
| **Auth** | JWT + bcryptjs, HttpOnly cookies |
| **Banking** | Plaid Node SDK (sandbox) + `react-plaid-link` |
| **Charts** | Custom SVG rendering (no chart library) |

---

## Project Structure

```
├── App.tsx                    # Main app: auth, branches, layout, Plaid integration
├── index.tsx                  # React entry point
├── index.html                 # HTML shell with theme CSS & font imports
├── types.ts                   # TypeScript types (TimelineBranch, FinancialEvent, etc.)
├── constants.ts               # Month utilities, branch colors, mock data
├── vite.config.ts             # Vite config + API middleware (auth, transactions, Plaid)
├── metadata.json              # App metadata
├── package.json
├── tsconfig.json
│
├── components/
│   ├── TimelineGraph.tsx      # Dual-mode SVG graph (Multiverse / Time Navigator)
│   ├── StatCards.tsx           # 2-row financial summary cards
│   ├── ScenarioChat.tsx       # AI chat panel for what-if prompts
│   ├── TransactionsPage.tsx   # Filterable/sortable transactions table
│   ├── ProfilePage.tsx        # User profile editor
│   └── LokiLogo.tsx           # Animated SVG logo
│
├── contexts/
│   └── ThemeContext.tsx        # Light/dark mode React context
│
├── services/
│   ├── geminiService.ts       # Gemini AI integration + prompt engineering
│   └── financeUtils.ts        # Balance calc, investment growth, currency formatting
│
├── scripts/
│   └── insert-transaction.mjs # CLI script to insert test transactions
│
└── server/                    # (Reserved for future Express extraction)
    ├── middleware/
    ├── models/
    ├── routes/
    └── services/
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **MongoDB Atlas** cluster (or local MongoDB)
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/)
- **Plaid API keys** from [Plaid Dashboard](https://dashboard.plaid.com/) (sandbox)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env.local` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/?appName=Cluster0
JWT_SECRET=your_secret_key
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
```

### 3. Run the app

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### 4. (Optional) Insert test transactions

```bash
npm run db:insert:transaction
```

---

## Usage

1. **Sign up / Log in** — creates a user in MongoDB with hashed password
2. **View your Prime Timeline** — real bank transactions are loaded and plotted
3. **Ask a what-if question** — type in the chat or click a month dot on the graph
4. **Explore branches** — click branch names in the legend to switch, use Prune to remove
5. **Connect a bank** — click "Link Now" to open Plaid Link (sandbox credentials: `user_good` / `pass_good`)
6. **Toggle views** — switch between Multiverse Navigator and Time Navigator
7. **Browse transactions** — switch to the Transactions tab for full data table
8. **Customize** — toggle dark/light mode, edit your profile

---

## API Endpoints

All endpoints are served via Vite middleware in development.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/signup` | Create a new user |
| `POST` | `/api/auth/login` | Authenticate and set JWT cookie |
| `GET` | `/api/auth/me` | Get current session user |
| `POST` | `/api/auth/logout` | Clear auth cookie |
| `GET` | `/api/transactions` | Fetch user's bank transactions |
| `GET` | `/api/plaid/status` | Check if bank is connected |
| `POST` | `/api/plaid/create_link_token` | Generate Plaid Link token |
| `POST` | `/api/plaid/exchange_public_token` | Exchange public token for access token |
| `POST` | `/api/plaid/disconnect` | Remove Plaid connection |

---

## License

This project was built for **HackNC** at NC State University.

---

<div align="center">
  <sub>Built with ⚡ Vite · 🧠 Gemini · 🍃 MongoDB · 🏦 Plaid</sub>
</div>
