# Book Cover Maker

Make matching A4 school book covers and download them as one PDF.
Parents unlock downloads for 4 months via Payfast: R50 for 2 children, R25 per extra child.

## Hosting (Netlify)

1. Netlify → Add new site → Import from GitHub → this repository, branch `payfast`.
2. Build command: leave empty. Publish directory: `.` (read from `netlify.toml`).
3. Site settings → Environment variables:

| Variable | Value |
|---|---|
| `PAYFAST_MODE` | `sandbox` while testing, `live` when ready |
| `PAYFAST_MERCHANT_ID` | from the Payfast dashboard (live only) |
| `PAYFAST_MERCHANT_KEY` | from the Payfast dashboard (live only) |
| `PAYFAST_PASSPHRASE` | set under Payfast → Settings → Developer settings (live only) |
| `TOKEN_SECRET` | any long random text; keep it private and never change it |

In sandbox mode the site uses Payfast's public test merchant, so no real money moves.
Passes are stored in Netlify Blobs (no database to set up).

## How payment works

- `/api/checkout` creates an order and returns a signed Payfast form.
- Payfast calls `/api/itn` after payment; the payment is verified (signature, Payfast validation, amount) before a pass is issued.
- `/api/license` lets the page confirm a payment, restore a pass by email, and add children to a pass.
