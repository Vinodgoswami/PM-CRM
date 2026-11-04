# 21 — Deploying on Render (free)

One free Render web service runs the API **and** serves the built website on the same address, so the session
cookie stays first-party (D-011, D-030). The other pieces are free tiers elsewhere:

| Piece         | Service                                   | Why                                                                                                                     |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| API + website | Render (free)                             | `render.yaml` in the repo root                                                                                          |
| Database      | Neon (free)                               | Render's free Postgres is deleted after 30 days                                                                         |
| Files         | Neon Object Storage (free, 5 GB, no card) | A free server's disk is wiped on every restart; the bucket keeps documents. R2 also works but asks for a payment method |
| Invite emails | Brevo SMTP                                | About 300 emails a day free                                                                                             |

Limits change; check each pricing page. The free Render service **sleeps after about 15 minutes idle** and takes
30–60 seconds to wake on the next visit (about $7/month removes this).

Secrets are typed into each provider's dashboard and into Render's environment page. Never commit them and never
paste them into a chat.

## 1. Code on GitHub

Render deploys from a Git repository. Create a **private** GitHub repository, then push `main` (merge `development`
into `main` first). `render.yaml` deploys the `main` branch.

## 2. Database — Neon

1. Create a project at neon.tech; region **AWS Asia Pacific (Singapore)** (close to the Render region).
2. Dashboard → **Connect** → turn **Connection pooling off** → copy the connection string
   (`postgresql://…neon.tech/neondb?sslmode=require`). This is `DATABASE_URL`.

## 3. Files — Neon Object Storage

Neon's S3-compatible storage is in the same Neon project as the database. Its free plan includes 5 GB. It is
offered in a few regions only (including AWS Singapore, `aws-ap-southeast-1`); the project must be in one of them.

1. Neon Console → your project → **Buckets** (or **Storage**) → create a **private** bucket named `pmcrm-files`
   → `S3_BUCKET`. (CLI alternative: `neon buckets create pmcrm-files`.)
2. **Settings → Credentials → Create credential**, name `pmcrm-render`, scopes **storage:read** and
   **storage:write**. The secret is shown once. Map what Neon shows to Render's names:

   | Neon shows              | Render variable        |
   | ----------------------- | ---------------------- |
   | `AWS_ENDPOINT_URL_S3`   | `S3_ENDPOINT`          |
   | `AWS_ACCESS_KEY_ID`     | `S3_ACCESS_KEY_ID`     |
   | `AWS_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY` |
   | `AWS_REGION`            | `S3_REGION`            |

3. After step 5 gives you the Render address, let the website upload to the bucket (CORS), once, from your
   computer. The values are the same as in Render; nothing is printed:

```bash
S3_ENDPOINT="…" S3_BUCKET=pmcrm-files S3_REGION="…" S3_ACCESS_KEY_ID="…" S3_SECRET_ACCESS_KEY="…" \
WEB_ORIGIN=https://pmcrm.onrender.com pnpm --filter @salescrm/api set-bucket-cors
```

Using Cloudflare R2 instead: create a bucket and an R2 API token (Object Read & Write on that bucket), set
`S3_ENDPOINT` to `https://<account id>.r2.cloudflarestorage.com`, `S3_REGION` to `auto`, and paste the same rule
under the bucket's **Settings → CORS policy**:

```json
[
  {
    "AllowedOrigins": ["https://pmcrm.onrender.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

## 4. Email — Brevo

1. Create an account at brevo.com and verify the sender address you will send from (Senders & IP).
2. **SMTP & API → SMTP** → generate an SMTP key. The **Login** shown there → `SMTP_USER`, the key → `SMTP_PASS`.
3. `EMAIL_FROM` is e.g. `Project Management CRM <you@yourdomain.com>` with the verified sender.

## 5. Render

1. render.com → **New → Blueprint** → choose the GitHub repository. Render reads `render.yaml` and creates the
   `pmcrm` web service (free, Singapore). `SESSION_SECRET` is generated for you.
2. Fill in the values it asks for: `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY`, `EMAIL_FROM`, `SMTP_USER`, `SMTP_PASS`, and `WEB_ORIGIN` = the service address,
   e.g. `https://pmcrm.onrender.com` (if Render adds a suffix to the name, use the address it shows).
3. Deploy. The build installs and builds both apps (`scripts/render/build.sh`); each start applies database
   migrations, then runs the API (`scripts/render/start.sh`). Health check: `/api/v1/health`.
4. If the address differs from what you entered, fix `WEB_ORIGIN`, re-run the CORS step (3.3) with it, then
   **Manual Deploy → Deploy latest commit**.

Auto-deploy is off (docs/04): after pushing new code, press **Manual Deploy** in Render.

## 6. The first Admin

Production has no demo data. Create the first Admin once, from your own computer, against the Neon database (the
password is typed at a hidden prompt; it is never printed or stored in a file):

```bash
DATABASE_URL="<the Neon connection string>" pnpm --filter @salescrm/api create-admin
```

Then open the Render address, sign in, and invite the CEO from **Users**; the CEO invites the project managers.
The script refuses to run when the database already has an Admin.

## Troubleshooting

| Symptom                                                          | Check                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Deploy fails at start with "Invalid configuration"               | A value is missing or wrong in Render → Environment; the log names it                   |
| Sign-in works but every change says "Request origin not allowed" | `WEB_ORIGIN` must equal the address in the browser exactly                              |
| Document upload fails                                            | CORS step (3.3) run with the exact address; bucket name; `S3_REGION`; credential scopes |
| Invites are "Not emailed"                                        | Brevo sender verified, `SMTP_USER` / `SMTP_PASS` correct                                |
| First visit is slow                                              | The free service was asleep; it wakes in 30–60 s                                        |
