# Demo administrator accounts

The Git source includes seed records for `tinluong`, `andrewha`, `leonnguyen`,
and `henryluu`. The first three use password `1234`; `henryluu` retains its existing
local password. These are intentionally committed demo credentials.
The records preserve the local account IDs and salted PBKDF2-SHA256 password hashes.

After deploying the latest source, use **Sign in**. Each account is inserted into
the deployment's connected account database on its first successful login.
This needs working account storage (`env.DB`); a Git push alone does not copy a
SQLite database or configure a Vercel database connection. Existing conflicting
usernames are never overwritten. Journals, photos, sessions, and other local
account data are not included in the seed.

The `MISSION_ADMIN_ACCOUNTS` environment variable overrides this seed. Remove an
old override to use the Git seed, or set it to `[]` to disable these demo admins.
Redeploy after changing environment variables. Replace demo credentials before
storing private data. Disabling the admin configuration removes administrator
privileges but does not delete already-created user records.
