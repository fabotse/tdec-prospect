# TDEC Prospect

AI-powered prospecting and outbound sales automation platform.

## Tech Stack

- **Framework:** Next.js 16+ (App Router)
- **Language:** TypeScript 5+ (strict mode)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Database & Auth:** Supabase
- **State Management:** Zustand (UI) + TanStack Query v5 (Server)
- **Forms:** React Hook Form + Zod
- **Animations:** Framer Motion
- **Drag & Drop:** @dnd-kit

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tdec-prospect
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Fill in your environment variables in `.env.local`

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
src/
├── app/                 # Next.js App Router
│   ├── (auth)/         # Auth route group
│   ├── (dashboard)/    # Protected route group
│   └── api/            # API routes
├── components/
│   ├── ui/             # shadcn/ui components
│   ├── common/         # Shared components
│   ├── builder/        # Campaign builder
│   ├── leads/          # Lead components
│   └── search/         # AI search
├── lib/
│   ├── supabase/       # Supabase clients
│   ├── services/       # External API services
│   └── ai/             # AI providers
├── hooks/              # Custom React hooks
├── stores/             # Zustand stores
├── types/              # TypeScript types
└── actions/            # Server Actions
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Environment Variables

See `.env.example` for all required environment variables.

## License

Private - All rights reserved.
