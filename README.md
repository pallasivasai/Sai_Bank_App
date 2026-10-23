# SAI Bank App

A mobile-friendly demo banking app built with **React, Vite, Capacitor, and Supabase**. The project demonstrates account dashboards, internal demo transfers, transaction history, and a time-limited wrong-payment recovery workflow backed by PostgreSQL functions.

> **Important:** SAI Bank is an educational/testing prototype. It is not a real bank, is not connected to UPI or banking rails, and must not be used to store or transfer real money.

## Highlights

- **Authentication:** Sign up and sign in with Supabase Auth.
- **Account overview:** View account number, hide/show balance, and see recent transaction activity.
- **Balance PIN prompt:** A demo-only convenience prompt before displaying the balance or sending a transfer. It is not banking-grade authentication.
- **Send money:** Transfer demo funds between active SAI Bank accounts using a database RPC designed to perform the balance updates and transaction record together.
- **Recipient suggestions:** Search active recipient accounts by name or account number as you type, then select a matching result.
- **Payment history:** Review incoming and outgoing demo transactions, search transaction history, and view statuses.
- **Wrong-payment recovery prototype:** Eligible completed transfers can expose an “Oops, I made a wrong payment” action for up to 24 hours, with a single-use recovery record.
- **Recovery debt demonstration:** If the recipient has already spent part of the transferred funds, the prototype can record a shortfall and freeze the recipient account; later verified demo credits can pay down the debt.
- **Mobile-friendly interface:** Responsive navigation, emerald/mint styling, transaction cards, recipient suggestions, and a visible logout action.
- **Public Android debug APK:** GitHub Actions builds the Android wrapper and publishes an APK asset in GitHub Releases.

## App screenshots and links

- **Repository:** https://github.com/pallasivasai/Sai_Bank_App
- **Releases:** https://github.com/pallasivasai/Sai_Bank_App/releases
- **Direct APK download:** https://github.com/pallasivasai/Sai_Bank_App/releases/latest/download/SAI-Bank-App.apk
- **Android build workflow:** https://github.com/pallasivasai/Sai_Bank_App/actions

The direct download URL is intended to remain clean and shareable. New commits to the main branch trigger the configured Android build workflows; check Actions to confirm a build succeeds before distributing a new release asset.

## Technology stack

- **Frontend:** React, Vite, JavaScript, CSS
- **Mobile packaging:** Capacitor / Android Gradle build
- **Identity and data:** Supabase Auth and PostgreSQL
- **Database operations:** PostgreSQL RPC functions for transfers, recovery, and recipient search
- **Automation:** GitHub Actions for web build and APK packaging

## Run locally

### Requirements

- Node.js 20.19+ or 22.12+
- npm
- A Supabase project with the SAI Bank schema and required PostgreSQL functions
- Android Studio / Android SDK if you want to build the Android app locally

### Configure Supabase

1. Copy `.env.example` to `.env.local`.
2. Set the project URL and a public publishable/anon key:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
   ```

3. Install dependencies and launch the app:

   ```bash
   npm install
   npm run dev
   ```

4. Create a production web bundle:

   ```bash
   npm run build
   ```

Never add a Supabase `service_role` key or secret key to `.env.local` values prefixed with `VITE_`, client-side code, or Git history. Browser-exposed configuration must only use the public publishable/anon key, with appropriate RLS and database-function authorization.

### Database setup

The `supabase/migrations/` directory contains the SAI Bank recovery-related reference migration. The connected Supabase project also uses the `banking_profiles`, `bank_accounts`, and `bank_transactions` tables, plus `bank_recovery_requests` and the required RPC functions.

For a fresh project, review the SQL carefully and apply the migrations and functions in order. Ensure row-level security (RLS) is enabled and policies are consistent with the app's intended data access. Recipient lookup should only return the minimal details needed for a payment recipient and should require a signed-in user.

## Build the Android APK

The repository contains GitHub Actions workflows under `.github/workflows/` that build the web bundle, package it through Capacitor/Gradle, and publish the APK to a GitHub Release.

1. Open the [Actions tab](https://github.com/pallasivasai/Sai_Bank_App/actions).
2. Select the latest **Build SAI Bank Android APK** run.
3. Confirm the run's conclusion is **success**.
4. Download the APK from [Releases](https://github.com/pallasivasai/Sai_Bank_App/releases) or use the direct APK URL above.

On Android, you may need to allow installation from the browser or file manager used to open the downloaded APK. Only install builds you trust. GitHub-hosted APKs in this project are debug/testing builds, not signed production releases.

## Demo transfer and recovery flow

1. Create two test accounts and make sure each account has an active `bank_accounts` row.
2. Sign in to one account and unlock the balance with the demo PIN prompt.
3. Open **Send money**, type the recipient's name or account number, and select the matching active account.
4. Enter a test amount and submit the demo transfer.
5. Open **Payment history** to inspect the transaction.
6. For an eligible test transfer, use the recovery action within the displayed 24-hour window.

The recipient search depends on the `search_bank_recipients(text)` RPC being installed in the connected Supabase project. The UI should show matching active accounts only when the signed-in user's database permissions and function setup are correct.

## Security and limitations

- The balance PIN prompt is a user-interface convenience stored in the browser session; it does not secure financial operations against a malicious client.
- A public publishable/anon key is expected to be visible in a browser or APK. Security must be enforced by PostgreSQL permissions, RLS policies, and properly authorized RPC functions.
- Demo credit operations are not a real deposit channel. In a real system, crediting money must be driven by a trusted payment processor or reconciled financial ledger.
- The recovery, negative-balance, freeze, and debt-settlement flows are prototypes for research and testing. They cannot reverse a real bank transfer.
- Before any real-money deployment, this project would need professional security review, robust identity and authorization controls, audit logging, fraud prevention, reconciliation, operational monitoring, and legal/regulatory review.

## License

No license file is currently specified. Unless a license is added to the repository, reuse and redistribution permissions are not explicitly granted.
