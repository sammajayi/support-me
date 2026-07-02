# SupportMe

SupportMe is a creator tipping and donation platform. This enables creators on Stellar to receive donations and tips easily through embedded widgets or shareable links.

## Live Demo

[https://support-me-tawny.vercel.app/](https://support-me-tawny.vercel.app/)

## What's New (v2)

- **User Authentication**: Email/password signup and login with JWT tokens
- **Creator Profiles**: Each user creates a unique username (e.g., `supportme.app/sammie`) with a public profile
- **Dashboard**: Track donations, earnings, and supporter statistics
- **Wallet Connection**: Connect Stellar wallet via Freighter to receive tips
- **Dynamic Donations**: Support any creator on the platform through their unique profile URL
- **Settings Page**: Update profile information and connect/update wallet address

## Features

- **User Authentication**: Secure signup/login with email and password
- **Creator Profiles**: Public, shareable creator pages with unique usernames
- **Wallet Integration**: Connect Freighter wallet for Stellar payments
- **Donation Tracking**: Backend-stored donation history with stats
- **Creator Dashboard**: Real-time analytics and recent supporter feed
- **Zero Fees**: 100% of donations go directly to creators
- **Instant Settlements**: Stellar blockchain ensures fast, secure transactions

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Prisma
- **Database**: PostgreSQL
- **Wallet**: Stellar SDK / Freighter
- **Auth**: JWT tokens, bcryptjs for password hashing

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
│   │   │   ├── signup/
│   │   │   ├── login/
│   │   │   └── username/       # Username creation after signup
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
│   │   └── freighter.js        # Wallet integration
│   └── package.json
├── docs/                       # Architecture documentation
├── PRD(v2).md                  # Product requirements
├── CONTRIBUTING.md             # Contribution guide
└── README.md
```

## User Flows

### Creator Flow

```
1. Sign Up (email/password)
   ↓
2. Create Username
   ↓
3. Land in Dashboard
   ↓
4. Go to Settings → Connect Wallet (Freighter)
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
3. Connect wallet (Freighter) to send donation
   ↓
4. Choose donation amount + optional message
   ↓
5. Sign and send XLM transaction
   ↓
6. Donation appears on creator's dashboard
```

## Installation

### Prerequisites

- Node.js 18+
- PostgreSQL
- Freighter wallet extension for Stellar (browser extension)

### Backend Setup

```bash
cd backend
npm install

# Setup environment
cp .env.example .env
# Update DATABASE_URL in .env with your PostgreSQL connection string
# Add a JWT_SECRET (random string for token signing)

# Generate Prisma client and run migrations
npm run prisma:generate
npm run prisma:migrate

# Start the development server
npm run dev
```

Backend will run on `http://localhost:4000`

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

- `POST /api/auth/signup` - Create account
  - Body: `{ email, password }`
  - Returns: `{ user: { id, email }, token }`

- `POST /api/auth/login` - Sign in
  - Body: `{ email, password }`
  - Returns: `{ user: { id, email }, token }`

### Creators

- `GET /api/creators` - List all creators
- `GET /api/creators/:username` - Get creator by username
- `POST /api/creators/:username/create` - Create username after signup (requires auth)
  - Body: `{ walletAddress, displayName, bio }`
- `PUT /api/creators/:username` - Update creator profile
  - Body: `{ walletAddress, displayName, bio, avatarUrl }`

### Donations

- `GET /api/donations` - List donations (query: `creatorUsername`)
- `POST /api/donations` - Record a donation
  - Body: `{ creatorUsername, senderAddress, amount, message, transactionHash }`

## Frontend Pages

- `/` - Landing page
- `/auth/signup` - Sign up page
- `/auth/login` - Sign in page
- `/auth/username` - Create username after signup (protected)
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

No environment variables required for local development. For production deployment, configure your API URL.

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

1. **Sign Up**: Go to `/auth/signup`, create account with email/password
2. **Create Username**: Redirected to `/auth/username`, choose a unique username
3. **Dashboard**: Land in `/dashboard` - see stats and profile link
4. **Connect Wallet**: Go to `/settings`, click "Connect Freighter", approve in wallet
5. **Share Link**: Copy your profile URL from dashboard
6. **Send Donation**: Visit your profile URL, connect wallet as supporter, send XLM

## Database Models

### User
```
id, email (unique), passwordHash, createdAt, updatedAt
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
- Passwords are hashed with bcryptjs (10 salt rounds)
- All sensitive routes require valid JWT token
- CORS is enabled for development (configure for production)
- Stellar transactions are signed client-side via Freighter

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
