# SupportMe

SupportMe is a creator tipping and donation platform. This enables creators on Stellar to receive donations and tips easily through embedded widgets or shareable links.

## Live Demo

[https://support-mee.vercel.app/](https://support-mee.vercel.app/)

## Smart Contract (Stellar Testnet)

Donations are recorded on-chain via a Soroban contract that also moves the
donated XLM from donor to creator in a single transaction.

- **Contract address**: [`CABIRZDB6LC5KYWUTROICM2GNJMNEU6SM2ACOTIM2V3EIQLQRPJG7XLF`](https://stellar.expert/explorer/testnet/contract/CABIRZDB6LC5KYWUTROICM2GNJMNEU6SM2ACOTIM2V3EIQLQRPJG7XLF)

- **Example transaction** (`donated 5 XLM to the creator @sammajayi wallet`): [`Transaction Details`](https://stellar.expert/explorer/testnet/op/14626038680150017)
- **Source**: [`contracts/donation/src/lib.rs`](contracts/donation/src/lib.rs)
- **Network**: Stellar Testnet, RPC `https://soroban-testnet.stellar.org`

The frontend calls this contract directly from `frontend/lib/contract.js`
(simulate → sign → submit → poll for confirmation), with live transaction
status shown on the donation page and errors categorized as wallet,
simulation, or network failures.

## Multi-Wallet Integration using StellarWallet Kits

![Connect Wallet modal showing Freighter, xBull, Albedo, Rabet, and LOBSTR options](frontend/public/multi-wallet-integration.png)

## What's New (v2)

- **Wallet Sign-In**: Connect a Stellar wallet and sign a challenge message to log in (no email/password) — JWT issued after signature verification
- **Creator Profiles**: Each user creates a unique username (e.g., `https://support-mee.vercel.app/sammajayi`) with a public profile
- **Dashboard**: Track donations, earnings, and supporter statistics
- **Multi-Wallet Connection**: Connect Freighter, xBull, Albedo, Rabet, or Lobstr to send or receive tips
- **On-Chain Donations**: Donations call a deployed Soroban contract that transfers XLM and records the donation on-chain
- **Dynamic Donations**: Support any creator on the platform through their unique profile URL
- **Settings Page**: Update profile information and connect/update wallet address

## Features

- **Wallet-Based Authentication**: Sign in by proving ownership of a Stellar wallet via a signed challenge message (SEP-0043/SEP-0053) — no passwords
- **Creator Profiles**: Public, shareable creator pages with unique usernames
- **Multi-Wallet Integration**: Connect Freighter, xBull, Albedo, Rabet, or Lobstr via Stellar Wallets Kit
- **On-Chain Contract Calls**: Donations are settled and recorded through a deployed Soroban contract
- **Donation Tracking**: Backend-stored donation history with stats
- **Creator Dashboard**: Real-time analytics and recent supporter feed
- **Zero Fees**: 100% of donations go directly to creators
- **Instant Settlements**: Stellar blockchain ensures fast, secure transactions

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Prisma
- **Database**: PostgreSQL
- **Smart Contract**: Soroban (Rust), deployed to Stellar Testnet
- **Wallet**: Stellar SDK + Stellar Wallets Kit (Freighter, xBull, Albedo, Rabet, Lobstr)
- **Auth**: JWT tokens, Stellar wallet sign-message challenge (SEP-0043/SEP-0053) for sign-in

## Project Structure

```
.
├── backend/                    # Express API and Prisma schema
│   ├── prisma/
│   │   └── schema.prisma       # Database models
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts         # Authentication endpoints
│   │   │   ├── creators.ts     # Creator profile endpoints
│   │   │   └── donations.ts    # Donation tracking endpoints
│   │   ├── middleware/
│   │   │   └── auth.ts         # JWT authentication middleware
│   │   ├── app.ts              # Express app setup
│   │   ├── server.ts           # Server entry point
│   │   └── prisma.ts           # Prisma client
│   └── package.json
├── frontend/                   # Next.js application
│   ├── app/
│   │   ├── auth/               # Authentication pages
│   │   │   └── username/       # Username creation after first wallet sign-in
│   │   ├── dashboard/          # Creator dashboard
│   │   ├── settings/           # Profile and wallet settings
│   │   ├── [username]/         # Dynamic creator profile pages
│   │   ├── donate/             # Redirect page
│   │   ├── layout.tsx          # Root layout with AuthProvider
│   │   ├── page.jsx            # Landing page
│   │   └── globals.css
│   ├── components/             # Reusable React components
│   ├── context/
│   │   └── AuthContext.tsx     # Global auth state
│   ├── lib/
│   │   ├── wallet.js           # Multi-wallet connection (Stellar Wallets Kit)
│   │   └── contract.js         # Soroban donation contract calls
│   └── package.json
├── docs/                       # Architecture documentation
├── PRD(v2).md                  # Product requirements
├── CONTRIBUTING.md             # Contribution guide
└── README.md
```

## User Flows

### Creator Flow

```
1. Connect Wallet & Sign Challenge Message (proves wallet ownership)
   ↓
2. Create Username
   ↓
3. Land in Dashboard
   ↓
4. Go to Settings → Connect Wallet (Freighter, xBull, Albedo, Rabet, or Lobstr)
   ↓
5. Profile is live at /[username]
   ↓
6. Share profile link with fans
   ↓
7. View donations in Dashboard
```

### Supporter Flow

```
1. Visit creator profile URL (e.g., supportme.app/sammie)
   ↓
2. See creator info and recent donations
   ↓
3. Connect a Stellar wallet (Freighter, xBull, Albedo, Rabet, or Lobstr)
   ↓
4. Choose donation amount + optional message
   ↓
5. Sign the on-chain `donate` contract call (live status shown)
   ↓
6. Donation appears on creator's dashboard
```

## Installation

### Prerequisites

- Node.js 18+
- PostgreSQL
- A Stellar wallet browser extension (Freighter, xBull, Albedo, Rabet, or Lobstr)

### Backend Setup

The backend needs a running PostgreSQL database before it will start. If you
don't already have one, the fastest options are:

- **Local**: install Postgres (e.g. `brew install postgresql@16` on macOS),
  start it, then create a database: `createdb supportme`.
- **Hosted (no local install)**: create a free Postgres instance on
  [Neon](https://neon.tech), [Supabase](https://supabase.com), or
  [Railway](https://railway.app) and copy the connection string it gives you.

Then set up the backend:

```bash
cd backend
npm install

# Setup environment
cp .env.example .env
# Edit .env and set:
#   DATABASE_URL - your PostgreSQL connection string
#                  (e.g. postgresql://user:password@localhost:5432/supportme)
#   JWT_SECRET   - any random string, used to sign login tokens

# Generate the Prisma client
npm run prisma:generate

# Push the schema to your database (creates the User/Creator/Donation tables).
# There is no migrations/ folder in this repo, so use `db push` rather than
# `prisma:migrate` - it syncs schema.prisma directly to the database:
npx prisma db push

# Start the development server
npm run dev
```

Backend will run on `http://localhost:4000`. Verify it's up with:
`curl http://localhost:4000/health` (should return `{"status":"ok",...}`).

If you only want to work on the frontend UI without a real backend, you can
skip this section for now - pages that don't require sign-in (the landing
page, public creator profiles) will still work. Anything behind
`ProtectedRoute` (dashboard, settings, username creation) requires the wallet
sign-in flow, which requires the backend to be running.

### Frontend Setup

```bash
cd frontend
npm install

# Create environment file
touch .env.local
```

No environment variables required for local development (frontend uses localhost:4000 API).

```bash
# Start the development server
npm run dev
```

Frontend will run on `http://localhost:3000`

## Backend API Endpoints

### Authentication

- `POST /api/auth/challenge` - Request a sign-in challenge for a wallet address
  - Body: `{ walletAddress }`
  - Returns: `{ message }` - a nonce-bearing message to be signed by the wallet (valid for 5 minutes)

- `POST /api/auth/verify` - Verify the signed challenge and sign in
  - Body: `{ walletAddress, signedMessage }` (`signedMessage` is the base64 signature from the wallet's `signMessage` call)
  - Returns: `{ user: { id, walletAddress }, token, hasProfile, username }`

### Creators

- `GET /api/creators` - List all creators
- `GET /api/creators/:username` - Get creator by username
- `POST /api/creators/:username/create` - Create username after first wallet sign-in (requires auth)
  - Body: `{ walletAddress, displayName, bio }`
- `PUT /api/creators/:username` - Update creator profile
  - Body: `{ walletAddress, displayName, bio, avatarUrl }`

### Donations

- `GET /api/donations` - List donations (query: `creatorUsername`)
- `POST /api/donations` - Record a donation
  - Body: `{ creatorUsername, senderAddress, amount, message, transactionHash }`

## Frontend Pages

- `/` - Landing page (includes "Connect Wallet" sign-in)
- `/auth/username` - Create username after first wallet sign-in (protected)
- `/dashboard` - Creator dashboard (protected)
- `/settings` - Profile and wallet settings (protected)
- `/[username]` - Public creator profile
- `/donate` - Redirects to home (legacy route)

## Environment Variables

### Backend (.env)

```env
DATABASE_URL=postgresql://user:password@localhost:5432/supportme
PORT=4000
JWT_SECRET=your-secret-key-here-change-in-production
NODE_ENV=development
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_DONATION_CONTRACT_ID=CABIRZDB6LC5KYWUTROICM2GNJMNEU6SM2ACOTIM2V3EIQLQRPJG7XLF
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

## Development Workflow

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

Visit `http://localhost:3000` in your browser.

### Testing the Flow

1. **Connect Wallet**: On the landing page, click "Connect Wallet", pick a wallet, and approve the sign-message request
2. **Create Username**: First-time sign-ins are redirected to `/auth/username`, choose a unique username
3. **Dashboard**: Land in `/dashboard` - see stats and profile link
4. **Set Payout Wallet**: Go to `/settings`, click "Connect Wallet", pick a wallet, approve (can be the same or a different wallet from the one used to sign in)
5. **Share Link**: Copy your profile URL from dashboard
6. **Send Donation**: Visit your profile URL, connect a wallet as supporter, sign the `donate` contract call

## Database Models

### User
```
id, walletAddress (unique), createdAt, updatedAt
```

### Creator
```
id, userId (foreign key), username (unique), walletAddress, 
displayName, bio, avatarUrl, socialLinks (JSON), donationGoal,
createdAt, updatedAt
```

### Donation
```
id, creatorId (foreign key), senderAddress, amount (Float),
currency (default: "XLM"), message, transactionHash, createdAt
```

## Deployment

### Backend Deployment

```bash
# Build TypeScript
npm run build

# Deploy dist/ folder to your server (Heroku, Railway, Fly.io, etc.)
# Set environment variables on your hosting platform
npm start
```

### Frontend Deployment

```bash
# Build Next.js
npm run build

# Deploy to Vercel (recommended for Next.js)
# Or use other platforms like Netlify, AWS Amplify, etc.
```

## Security Notes

- JWT tokens expire in 7 days
- Sign-in requires a signed challenge message proving ownership of the wallet's private key (SEP-0053 verification), not just a submitted address
- All sensitive routes require valid JWT token
- CORS is enabled for development (configure for production)
- Stellar transactions are signed client-side via the connected wallet (Stellar Wallets Kit)

## Contributing

See `CONTRIBUTING.md` for guidelines on making changes, opening issues, and submitting pull requests.

## Roadmap

- [ ] Twitter OAuth authentication
- [ ] Magic link (email-only) authentication
- [ ] Custom themes for creator profiles
- [ ] Leaderboards (top creators, top supporters)
- [ ] QR code generation for profiles
- [ ] Email notifications for donations
- [ ] Multiple currency support (USDC, USDT, etc.)
- [ ] Embeddable donation widgets
- [ ] Creator goals and progress tracking

## License

MIT

## Support

For issues, questions, or suggestions, please open an issue on GitHub or contact the team.
