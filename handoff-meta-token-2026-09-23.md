# Session Handoff: Meta/Instagram token expiry (Social Calendar and Mustache Vault)

Written 2026-09-23, about 18:00 UTC. The user is Kevin (Mustache Journey, Hello@mustachejourney.com).

## Goal
It started with a "Instagram token refresh is failing" email from the Social Calendar app. Kevin asked:
1. Why it happened, since the project had anticipated this.
2. For the manual fix.
3. For a code fix so it doesn't happen again.

Then he asked the same question about his other Meta integration: the `mustache-vault` app, whose docs live in the `reels-lab-mcp` repo. Both fixes are now **merged**. What's left is verification: one check tomorrow and a few dated reminders.

## User preferences (from their profile; follow them)
- Ask clarifying questions before complex answers or tasks when more information is needed.
- Kevin has limited coding knowledge. Explain in plain language and give click-by-click steps.
- Be honest and don't sugarcoat. **If unsure, say so or leave it blank. A wrong answer is three times worse than a blank one.**
- Never ask Kevin to paste a token into chat. Only dates and metadata.

## What happened: the root cause (settled, don't re-derive)
**Social Calendar (`kev124-hub/Social-Calendar`, Next.js on Vercel, Supabase):**
- It uses a Facebook-Login long-lived user token (graph.facebook.com), refreshed via `fb_exchange_token` by the 5-minute publish cron. The cron is driven by cron-job.org, not Vercel.
- From about Sept 13 (10 days left), every refresh "succeeded", but Meta returned the **old token's remaining lifetime**, so the expiry never moved.
  - Proof from the Supabase `app_credentials` table: saved 2026-09-23 15:30:10Z, expiry 15:31:41.784Z. The milliseconds show the expiry was computed as now + `expires_in`.
- The code logged each run as `refreshed`. The warning only fired on a failed call with 3 or fewer days left, so the first email arrived 4 minutes after expiry (15:35 UTC). Instagram auto-publishing was down from 08:31 PDT.
- The email's own fix ("set `INSTAGRAM_USER_ACCESS_TOKEN` in Vercel and redeploy") **could not work alone**: the DB row always took priority over the env var.

## Done: manual recovery (verified)
- Kevin made a new token in the Graph API Explorer:
  - Chose **Get User Access Token**. Scopes: pages_show_list, instagram_basic, instagram_content_publish, pages_read_engagement, public_profile. The Instagram account ID in the granular scopes is 17841455072367303.
  - Then used the Access Token Debugger → **Extend Access Token** to get the 60-day version.
- He set it in Vercel, redeployed, and deleted the `instagram_user_access_token` row in Supabase.
- Verified: the row was recreated at 17:35:05Z with **expires_at 2026-11-22 17:24:39+00**. Publishing is working again.
- Meta's "Data Access Expires" for this token is 2026-12-22. It's a separate limit and not an issue.

## Done: code fix 1, Social Calendar ([kev124-hub/Social-Calendar#53](https://github.com/kev124-hub/Social-Calendar/pull/53), MERGED, merge sha a97d01e)
- `src/lib/ig-token-policy.ts` (new, pure, and tested). It holds:
  - `refreshExtended`: the new expiry must be at least 1 day past the old one.
  - `envTokenDecision`: returns `adopt-env`, `baseline` or `keep`.
  - `tokenFingerprint`: sha256, first 16 hex characters.
  - The warning texts and `ROTATION_STEPS`, the full manual steps with no database step.
- `src/lib/ig-token.ts` (rewritten):
  - A refresh that doesn't extend returns status `expiring` and emails daily ("renew by hand").
  - A failed refresh now emails from 10 or fewer days out (was 3).
  - Past expiry: an "expired" email and no exchange call.
  - A changed env token is adopted automatically via the fingerprint in `app_credentials` key `instagram_env_token_fingerprint`. The first sighting only records a baseline.
- `src/lib/instagram.ts`: comment updated with the observed behavior.
- `tests/ig-token.test.mjs` (new) and `tests/README.md` row added.
- `README.md`: token lifecycle and manual renewal steps. `HANDOFF.md`: the "unproven path" section was replaced with what actually happened.
- Checks at the time: `npm test`, `tsc --noEmit` and `eslint` all passed.
- **Expected behavior now:** the first run after deploy records the env fingerprint baseline, which Kevin can see as a new `instagram_env_token_fingerprint` row. From about **Nov 12** Kevin gets a daily "renew it by hand" email, because `fb_exchange_token` doesn't extend this token type. Manual renewal is now: Explorer → Extend → Vercel → redeploy. No Supabase step.

## Done: code fix 2, Mustache Vault ([kev124-hub/mustache-vault#184](https://github.com/kev124-hub/mustache-vault/pull/184), MERGED, merge sha 6e20fc0)
- The vault uses **Instagram Login** (graph.instagram.com, `ig_refresh_token`), a different kind of token from the calendar's. Meta documents it as giving a fresh 60 days, but that's **not verified**.
- Its token code is in `mustache-vault`, not `reels-lab-mcp` (that repo only has docs mentioning it). The database is **Neon Postgres** (`app_settings` table), not Supabase. Alerts go by **ntfy push**, not email.
- Old weaknesses:
  - Any returned token counted as success.
  - The expiry was never recorded.
  - A 50-day clock reset on "success", so a non-extending refresh would have been silent for 50 days.
  - The env var was ignored once the DB had a token.
- Before the fix, Neon showed `meta_token_refreshed_at` = 2026-09-19T10:21:34Z. The old docs said the token "expires 2026-09-28". The real expiry was **unknown**.
- What changed:
  - `api/_lib/metaTokenPolicy.js` (new, pure): `decideRefresh`, `refreshExtended`, `expiryFromResponse`, `envTokenDecision`, `tokenFingerprint`, and the warning texts.
    - Refresh when 10 or fewer days are left, judged on the real expiry.
    - If the expiry is unknown and the token is at least a day old, refresh to learn it.
    - A refresh counts only if it leaves more than 10 days and beats the old expiry by at least a day.
  - `api/_lib/meta.js`:
    - `refreshMetaTokenIfDue` now takes injectable dependencies (`query`, `fetchImpl`, `now`, `envToken`).
    - New `app_settings` keys: `meta_token_expires_at` and `meta_env_token_fingerprint`.
    - `getMetaAccessToken` returns the env token immediately if its fingerprint changed.
  - `api/sync-sheet.js`: pushes `metaToken.warning` via ntfy (guarded on `NTFY_TOPIC`).
  - `db/test-meta-token.mjs` (new; fake DB and fake Meta).
  - README updated.
  - Checks: `npm test` (47 files) passed, eslint clean, CI "test" passed, still 12 `api/*.js` functions (the Vercel Hobby cap).
- **Expected:** the next daily cron run (`0 10 * * *` UTC = **2026-09-24 10:00 UTC**, about 6 AM Eastern) sees an unknown expiry and a token 4+ days old, calls refresh, and records the real expiry. It should be about **2026-11-23** if Meta extends. If Meta returns only the remaining time (expiry ≈ 2026-09-28), Kevin gets a "Meta token refresh did NOT extend it" ntfy push, and must renew by hand before Sept 28.

## Next steps
1. **On 2026-09-24 after ~10:30 UTC**, have Kevin run this in **Neon**:
   ```sql
   select key, value, updated_at from app_settings where key in ('meta_token_expires_at','meta_token_refreshed_at','meta_env_token_fingerprint');
   ```
   - `meta_token_expires_at` about 2026-11-23 → the vault is confirmed healthy. Done.
   - It shows about 2026-09-28, or there's an ntfy push → a **manual vault re-auth is needed before Sept 28**:
     1. developers.facebook.com → the Meta app → **Instagram API with Instagram Login** → generate a long-lived token with `instagram_business_basic` + `instagram_business_manage_insights`.
     2. Set it as `META_ACCESS_TOKEN` in the **mustache-vault** Vercel project, then redeploy.
     3. No database step; the new code adopts it.
     - I haven't verified the exact button names on that Meta screen. Ask Kevin for a screenshot if he's unsure.
   - No `meta_token_expires_at` row and no `meta_env_token_fingerprint` row → the cron probably didn't run or the deploy failed. Check the Vercel deployment, then the cron.
2. **Optional check on the calendar:** in Supabase, `select key, expires_at, updated_at from app_credentials order by key;`. There should be an `instagram_env_token_fingerprint` row, and the token row should still show expires 2026-11-22.
3. **Kevin's reminders:** a calendar note around **Nov 15** to renew the Social Calendar token. The app's daily emails should start about Nov 12 anyway.
4. **Offered, not started (only if Kevin asks):** research a **non-expiring** token for the Social Calendar, e.g. a system-user token from Meta Business Settings, to end the 60-day manual rotation. It hasn't been researched or tested. Verify against current Meta docs before recommending anything.
5. **Offered, not started:** the Supabase email "New tables in public need explicit grants from October 30" (to kev124@gmail.com).
   - It **doesn't affect existing tables**.
   - Future risk: a new table, or rebuilding the database from `supabase/migrations/001–008` after Oct 30, would need `GRANT` statements. None of the migrations have them.
   - Kevin was asked whether to add a doc note or add grants now. **He hasn't answered.**

## Ruled out / settled (don't redo)
- Vercel runtime logs for Sept 13–23: the Hobby plan keeps them only briefly (about an hour, from memory, not verified). The Supabase timestamps answered the question instead.
- Whether the calendar token "failed": no. The calls succeeded; the problem was that nothing checked the expiry moved.
- Calendar: choose **User Token** (not Page or App) in the Explorer, then **Extend** in the debugger.

## Environment notes
- This was a cloud session. Repos were cloned at `/home/user/Social-Calendar` (primary), `/home/user/reels-lab-mcp` and `/home/user/mustache-vault`. A new session starts from fresh clones.
- The Social Calendar `AGENTS.md` says: after a PR merges, run `git fetch --prune origin && git checkout -B <branch> origin/main`. Don't "fix" GitHub's merge commit that the stop hook flags.
- Branch used in both repos: `claude/exciting-allen-up95wt`. Both PRs are merged; start any new work fresh from `main`.
- Secrets/env var names only:
  - Calendar: `META_APP_ID`, `META_APP_SECRET`, `INSTAGRAM_USER_ID`, `INSTAGRAM_USER_ACCESS_TOKEN`, `CRON_SECRET`.
  - Vault: `META_ACCESS_TOKEN`, `NTFY_TOPIC`, `DATABASE_URL`, `CRON_SECRET`, `REELS_WEBHOOK_SECRET`.
- No PR subscriptions or scheduled check-ins are active. All were cancelled after the merges.
