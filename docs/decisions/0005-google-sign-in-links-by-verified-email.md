# 0005 · Google sign-in links to one account, keyed by a verified email

Status: accepted · 2026-09-10

## Context

US5 wants Google as a way in. [0004](0004-sessions-as-signed-cookies.md) already
decided what a session is, and deliberately made it provider-agnostic — so this
is not a second authentication system, it is a second door into the same one.
`requireAuth` cannot tell the two apart, which is the point.

That leaves three choices this branch actually has to make.

**What a Google identity is on the user.** A single `googleId` field is obvious
and cheap. A general `identities: [{ provider, subject }]` array is what we would
want at three providers, since three sparse unique indexes and a growing `$or`
is not a shape anyone enjoys.

**What happens when a Google address already has a password account.** Creating a
second account gives one person two identities and splits their watchlist. Linking
gives them one account reachable two ways — but linking on an address Google has
not verified would let anyone who can get Google to *claim* an address take over
the account already using it. That is account takeover, not a convenience.

**Whether Google config is required to boot.** `MONGO_URI` and `JWT_SECRET` are
required because nothing works without them. Google is not in that category: the
server, and email/password sign-in, work perfectly without it.

## Decision

**A `googleId` field, sparse and unique.** Not `identities[]`. At three users and
one provider, the general shape is cost against a maybe; migrating one field into
an array later is an afternoon, and we will know by then whether GitHub is real.

**Link on a verified address, refuse on an unverified one.** If Google reports
`email_verified`, a sign-in for an address that already has an account links to
it. If it does not, the attempt is refused outright — including for a brand new
account, because an address we cannot trust is not an identity.

**The `googleId` is the identity; the address is not.** A returning user is found
by `googleId` first, so changing their Google email does not strand them or
silently move their account.

**Google config stays optional.** The two routes answer 503 when it is missing,
and everything else is unaffected. Requiring it would stop CI and every teammate
who has not made a client.

**No new dependency.** The code exchange is `fetch`, and the ID token is read with
the `jsonwebtoken` we already have.

## Consequences

- **`passwordHash` is now optional on the model**, since a Google-only account has
  none. The schema no longer guarantees that a user has any credential at all —
  `features/auth` does. That is the same shape of honesty as 0003's third
  consequence: the boundary is documented and reviewed, not enforced by the file.
- The ID token is decoded **without verifying its signature**. That is sound only
  because it comes straight back from Google's token endpoint over TLS, where
  nobody could have substituted it. A token arriving from a browser must never be
  read this way, which is why the decode lives in `google.js` and not in
  `session.js` next to the verifying one.
- **No Google token is stored and no offline access is requested.** Google is
  asked who this is, once; our own cookie takes over from there. There is no
  refresh token to leak, expire, or rebuild a flow around.
- A user with an unverified Google address cannot sign in at all, not even to
  create a fresh account. Deliberate, and it costs us the small number of people
  whose Google account is in that state.
- **Password reset, when FR08 brings a mailer, has to handle an account with no
  password.** Offering to set one is the obvious answer, but it is a decision that
  branch has to make rather than inherit.
- `/auth/login` still has no rate limit, and this adds no new brute-force surface
  — Google does that work now — but the note in 0004 stands.
- The callback redirects to the client on failure rather than returning JSON,
  because it runs as a top-level browser navigation. The reason goes to the server
  log; the URL gets only `?auth=failed`. If the client ever needs to distinguish
  causes, that is where to add it.

## Update · 2026-11-22: the ID token is verified, with a nonce and PKCE

The second consequence above no longer holds. OpenID Connect Core §3.1.3.7 does
let a client skip the signature for a token that came straight from the token
endpoint over TLS, but the same section still requires checking `iss`, `aud`
and `exp`, and the code checked none of them. A token Google issued to another
app would have been accepted. ASVS V6.8.2 asks for the signature anyway.

**What is checked now**, in `google-id-token.js`, before anything in the token
is used:

| Check | Rule | Why |
| :--- | :--- | :--- |
| Signature | RS256 only, against Google's published keys, looked up by the token's `kid` | `none` and the HS256 trick (the public key used as an HMAC secret) are refused before any key is touched |
| `iss` | `https://accounts.google.com` or `accounts.google.com` | Google uses both spellings |
| `aud` | Our `GOOGLE_CLIENT_ID` | A token for another app is refused (ASVS V10.5.4). An empty client ID refuses everything, because `jsonwebtoken` skips the audience check for an empty one |
| `azp` | Our client ID whenever present, and required when `aud` lists several | `jsonwebtoken` passes an `aud` list if any entry matches |
| `exp` | Required, and in the future, with 60 seconds of clock tolerance | `jsonwebtoken` checks `exp` only when it is present |
| `nonce` | Equal to the one this browser's attempt sent | A token from another sign-in is refused (ASVS V10.5.1) |
| `sub`, `email` | Non-empty strings | As before |

**The keys** come from `https://www.googleapis.com/oauth2/v3/certs`, fixed in
code like the authorize and token URLs, with no discovery document. They are
cached for as long as Google's `Cache-Control: max-age` says (about five hours
when checked), or an hour without one. An unknown `kid` means Google may have
rotated, so it refetches once, but at most once a minute across all requests: a
burst of tokens with made-up `kid`s can't become a burst of requests to Google.
A failed fetch blocks another try for that same minute.

**One cookie holds the attempt.** `mjolnir_oauth_state` (`__Host-mjolnir_oauth_state`
in production) now carries three values joined by `.`: `state`, `nonce` and a
PKCE `code_verifier`, 32 random bytes each in base64url. They expire and clear
together, as `state` alone did.

**PKCE (RFC 7636, S256).** The authorization URL carries the verifier's SHA-256
hash, and the code exchange sends the verifier itself. A code stolen on its way
back from Google is useless without it. We also have a client secret and the
nonce, so this is defence in depth, as RFC 9700 §2.1.1 recommends. Google's
discovery document lists S256.

**Every failure lands on a page.** A network error or a timeout on the token
endpoint is now an `HttpError` (502), like every check above (400), so the
callback always redirects to `/?auth=failed`. The log line is
`Google sign-in failed: <message> (<reason>)`, where the reason is one word
(`audience`, `nonce`, `keys-unavailable`, and so on), never the token or the
address. Anything that isn't an `HttpError` is still thrown, so a real bug still
surfaces. `state` is compared in constant time, and a repeated `code` or
`state` parameter (an array) is refused before Google is asked.

**When Google refuses the code, the log says what Google said.** A wrong
verifier, a used or expired code, and a redirect URI or client secret that
doesn't match all come back as a 400, told apart only by the reply's `error`.
So the reason becomes, for example, `token-endpoint: invalid_grant "…"`, with
Google's description in the quotes.
Google's text is outside input: `error` and `error_description` are kept only
in the characters RFC 6749 §5.2 allows (printable ASCII without `"` or `\`, so
no line break can forge a log line), up to 64 and 200 characters, and dropped
otherwise. Nothing else in the reply is read.

**Still no new dependency.** `jsonwebtoken` verifies with a `KeyObject`, and
`crypto.createPublicKey({ key, format: 'jwk' })` imports Google's keys.

**Consequences:**

- `GOOGLE_CLIENT_ID` has to be the client that the redirect goes to. A token
  minted for any other client is now refused, where before it was read.
- The server needs outbound HTTPS to `www.googleapis.com` as well as
  `oauth2.googleapis.com`. If the keys can't be fetched, Google sign-in fails,
  and password sign-in is unaffected.
- A sign-in started before this deploy (a one-part cookie) fails once and works
  on the next try.
- `auth-google-token.test.js` signs its own tokens with generated keys, and
  `auth-google.test.js` drives the whole callback with `fetch` mocked, so the
  suite still never calls Google.

## Update · 2026-11-22: what a link may do to the account it finds

Linking by a verified address assumed the account using that address was its
owner's. Before [0041](0041-an-address-is-confirmed-before-the-account-exists.md)
nothing checked that, so a stranger's password account on your address took you
in on your first Google sign-in (pre-account hijacking). And the link was one
upsert that set `googleId` whatever was there, so a second Google account
claiming the address replaced the first (ASVS V6.8.1).

Now `signInWithGoogle` looks at the account first, and each case is one write
that names the state it expects:

| The account using the address | What a Google sign-in does |
| :--- | :--- |
| None | Creates one, with `emailVerifiedAt` and no password |
| Confirmed (`emailVerifiedAt`), no `googleId` | Links: sets `googleId`, keeps the password, whose owner made both |
| Never confirmed, no `googleId` (from before 0041) | Links, sets `emailVerifiedAt`, and **removes the password**: Google's verified address beats an unconfirmed password |
| Already linked to another Google account | Refuses, 409 `google-account-mismatch`; never replaces it |

- **Two callbacks at once can't both act.** The loser of a race finds nothing
  to update, tries once more from the top, and then gives up with a 409.
- **The owner is told.** A link to an account that already existed sends "บัญชี
  Google เชื่อมกับบัญชีของคุณแล้ว" after the redirect (part of ASVS V6.3.7).
  Since only a Google account with this exact verified address can link, the
  email says to secure that Google account if it wasn't them.
- **Registrations waiting for the address are deleted** once Google creates or
  links the account: none of them could be confirmed after that.
- **A returning user** (found by `googleId`) gets `emailVerifiedAt` if it was
  missing, and is otherwise unchanged.
- **The callback learns whether it linked:** `signInWithGoogle` returns
  `{ user, linked }`.

## Update · 2026-11-22: a Google-only account can add a password

The decision the Consequences left to the reset branch:
[0042](0042-passwords-can-be-changed-reset-and-checked.md) lets an account
with no password set one through the same emailed link as a reset. The email
says "set" instead of "reset". `/account` offers it when the account has no
password, since there's no current one to give.

## Update · 2026-11-22: the failure line is a security event

[0043](0043-one-line-per-security-event.md) replaced the `console.warn` above.
A failed callback is now an `auth.google.failure` JSON line, and its `reason`
holds what the parentheses held: the check that failed, then Google's refusal
when there was one (`token-endpoint: invalid_grant "…"`). Three failures that
happen before Google is asked have reasons of their own: `no_attempt` (no
attempt cookie), `no_code` (which is also what cancelling at Google looks like)
and `state_mismatch`. A successful sign-in is an `auth.google.success` line.
Neither carries the token, the code or the address.
