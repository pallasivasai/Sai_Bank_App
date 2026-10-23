# SAI Bank App

A learning/demo banking application using React + Vite + Supabase Auth/Postgres. **Not a real bank and not connected to UPI/banking rails.** Recovery is a prototype workflow, not an ability to reverse real completed bank transfers.

## Features
- Sign up and sign in with Supabase Auth.
- Balance dashboard and transaction history.
- Send demo funds using an atomic Postgres RPC.
- "Oops, I made a wrong payment" available for a completed transfer for 24 hours.
- Single-use recovery record and immutable-style reversal transaction log.
- If recipient funds were already spent, the account can go negative and becomes frozen; trusted demo credits pay down the debt first and the account becomes active once settled.
- PIN prompt before revealing the balance (demo-only client-side convenience, not a replacement for banking-grade authentication).

## Setup
1. Use the Supabase project whose database has the SAI Bank schema and migration in `supabase/migrations/`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your project's URL and publishable/anon key.
3. Install Node.js 20.19+ or 22.12+, then run:
   ```sh
   npm install
   npm run dev
   npm run build
   ```
4. The database migration was applied directly to the connected Supabase project and is also checked into this repository as a reference. If setting up another project, review and apply migrations in order.

## Important security notes
- Never put a Supabase service-role key in client code or commit secrets.
- Demo credit RPC `apply_account_credit` is authenticated and only credits the caller's own account, but this is **not** a production deposit endpoint. In real use, incoming credits must be verified by a trusted payment provider/webhook or bank ledger, not called by the customer.
- Current setup is an educational prototype. Before real-money use, require professional security review, strong server-side identity verification, audit/ledger reconciliation, rate limiting, fraud controls, and compliance/legal review.
