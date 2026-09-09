---
type: reference
title: Name and domains
updated: 2026-09-08
---

# Name and domains

Product name: Attestat. Decided by the builder on 2026-09-07 (FACT, builder message in the Claude Code session of 2026-09-07; recorded in /Users/bioharz/git/ethglobal/nachweis/wiki/decisions.md). This supersedes the earlier decision of the same day that the name stays Nachweis. The wiki directory and the repository names keep "nachweis" until a rename is decided (see Open items).

## Why the name changed

- Nachweis is a German word (proof, receipt, certificate). English speakers say "NATCH-wise" or "NACK-wise" for the German "NAHKH-vice". The failure mode is hearing the name and then typing it (nachwise, nachvice, nakweis). OPINION, lead.
- Name space: for Nachweis only the .dev was free. nachweis.com, .io, .xyz, .app were registered by others and the GitHub account "nachweis" is taken (FACT, registry RDAP and https://api.github.com/users/nachweis, checked 2026-09-07). A product that gains traction would have had to rebrand or live with mismatched handles. OPINION, lead: this weighed more than pronunciation.
- The builder asked for a name that reads well in English while keeping a German or European flavour. Attestat exists as a legal term for a certificate or attestation in German, French, Russian and Scandinavian usage; English readers parse "attest" plus a suffix. Pronunciation "AT-ess-tat", no sound English lacks. It matches the contract name AttestationRegistry.
- A batch of English-only names (attested, vouchsafe, vetted, cleared, greenlit, bouncer, wristband, guestlist and others) was checked after the decision on Attestat had been taken and was not carried forward.

## Availability at the time of decision

Checked 2026-09-07 by RDAP against the registries (Google for .dev and .app, CentralNic for .xyz, Verisign for .com, Radix for .tech) and by whois for .io, .de, .eu, .org, .co, .net. "free" means no registration record existed at check time, not a price check.

| Domain or handle | Status 2026-09-07 | Note |
|---|---|---|
| attestat.dev | free, then bought by the builder | primary |
| attestat.app | free, then bought by the builder | defensive, later hosted demo |
| attestat.xyz | free, then bought by the builder | defensive, crypto TLD |
| attestat.eu | free, not bought | candidate company domain (EUDI, eIDAS 2 market) |
| attestat.de | free, not bought | German company site; "Attestat" is a German word, squat risk |
| attestat.tech | free, then bought by the builder on 2026-09-08 | defensive |
| attestat.co, .org, .net | free, not bought | low value |
| attestat.com | taken | registered 2024-04-11 via GoDaddy, expires 2027-04-11, redirects to a GoDaddy "/lander" parking page |
| attestat.io | taken | |
| GitHub organisation "attestat" | free at check time | registration by the builder: unverified |

Purchases, confirmed by registry RDAP on 2026-09-08 (FACT, https://pubapi.registry.google/rdap/domain/attestat.dev and .app, https://rdap.centralnic.com/xyz/domain/attestat.xyz, https://rdap.radix.host/rdap/domain/attestat.tech): attestat.dev, attestat.app and attestat.xyz registered 2026-09-07 20:54:05 UTC, attestat.tech registered 2026-09-08 17:23:51 UTC. All four at Porkbun LLC (IANA 1861) on the default Porkbun nameservers, expiry one year. On 2026-09-08 the builder asked whether someone else had taken .dev, .xyz and .tech; the timestamps and the common registrar show that all four registrations are the builder's own.

## Priority and use per domain (OPINION, lead, accepted by the builder)

1. GitHub organisation "attestat": free of charge, handles go faster than domains.
2. attestat.dev: primary. Landing page, docs, API, the link in the ETHGlobal submission. Reads as infrastructure to the jury. HTTPS is enforced by the registry (HSTS preload).
3. attestat.app: same registry and trust level as .dev. Later hosted demo or wallet-facing flow. Bought now so nobody takes it once the submission is public. Redirect to .dev until used.
4. attestat.eu: company face for the EU compliance market if the .com stays out of reach. Not bought.
5. attestat.de: block a German squatter, corporate site with Impressum. Not bought.
6. attestat.xyz: defensive only, against a fake or phishing copy on the obvious crypto TLD. Not for the jury, not for business. Redirect to .dev.
7. attestat.tech: bought 2026-09-08 as a defensive registration; redirect to .dev. attestat.co, .org, .net: skip unless a full defensive sweep is done later.

## Collision check (FACT, web search 2026-09-07)

No crypto or identity project named Attestat was found. Nearby names exist: Attest (identity on Veres One, 2019), Attestiv, Attesto. A trademark search before a commercial launch is still needed (unverified whether "Attestat" is registrable as a mark in the EU, given its generic legal meaning in several languages).

Rejected candidates and why: nullproof (existing zk credential project, nullproof.xyz), sealpass (existing password manager and a Gameseal subscription), selfproof (collides with Self protocol), provenpass ("Proven" is an existing zk solvency company), einlass (generic German ticket-admission word, several Einlass apps in the stores, einlass.app exists), pforte (GitHub handle taken, English pronunciation unclear), holdproof (reads as proof of holdings), blindpass (GitHub and .io taken). Mostly taken across TLDs: attesto, attesta, attestly, attestor, vidimus, fidem, treu, eligo, pruf, testat, zeugnis, ausweis, beleg, siegel, sesam.

## Open items

Status 2026-09-08 (WP20, Attestat public copy and hosting preparation).

Prepared by the agent, nothing executed against DNS or hosting:

- Landing page copy renamed (FACT, /Users/bioharz/git/ethglobal/nachweis-site commit 3727280 on main, pushed): title, brand, hero, meta and Open Graph tags, footer domain attestat.dev, canonical URL https://attestat.dev/. The interactive section is labelled "scripted walkthrough with sample data; the working application is separate" and links to the application repository and the demo runbook. Privacy copy states the disclosure boundary per proof route (names go to the issuer's verifier; server-side route: the server saw the presentation; client-side route: the device decrypts and proves). "First" wording removed from the wallet section; the exclusivity sentence ("we found no other product") removed; eIDAS dates qualified (wallet by end of 2026, acceptance from end of 2027, Art. 5a and 5f).
- Hosting files: /Users/bioharz/git/ethglobal/nachweis-site/CNAME (content attestat.dev) and /Users/bioharz/git/ethglobal/nachweis-site/docs/hosting.md with the ordered builder steps: GitHub Pages recommended (FACT, https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages fetched 2026-09-08: Pages on a private repository needs GitHub Pro, Team or Enterprise; on Free the repository must be public), the A, AAAA and www CNAME records for Porkbun, and Porkbun URL forwarding (301, wildcard, include path) from attestat.app, attestat.xyz and attestat.tech to https://attestat.dev. Cloudflare Pages rejected for the apex because it requires moving the nameservers to Cloudflare (FACT, https://developers.cloudflare.com/pages/configuration/custom-domains/ fetched 2026-09-08).
- App surfaces renamed on branch wp20-attestat-copy of nachweis-app: README first heading, intro line "Attestat, formerly Nachweis", a "Name" section with the table of identifiers kept, app title tag "Attestat demo", header wordmark, video shot list title card and closing sentence, product-name lines in the demo runbook and the prover READMEs.
- Rename scope applied (decision of 2026-09-08 in /Users/bioharz/git/ethglobal/nachweis/wiki/decisions.md): public copy says Attestat; repository names, package and crate names, "nachweis:session:", "nachweis.pid.over18.v1", the "nachweis://handoff" scheme, env var names, the phone app identifiers (org.nachweis.prover, io.nachweis.prover, display name "Nachweis Prover") and the on-chain token name "Nachweis Demo Fund" stay. The table is in the README of nachweis-app (section "Name").
- Paste-ready submission fields in /Users/bioharz/git/ethglobal/nachweis/wiki/submission-text.md.

Stays with the builder:

- Register the GitHub organisation "attestat" (optional; repositories stay under devdotbo/nachweis-* for the submission).
- Make devdotbo/nachweis-site public (or hold a GitHub Pro plan), enable Pages, set the custom domain, add the DNS records at Porkbun, enforce HTTPS: the exact order is in /Users/bioharz/git/ethglobal/nachweis-site/docs/hosting.md. Verification of the live site (curl of https://attestat.dev) happens after that; unverified until then.
- Set the three Porkbun URL forwards (.app, .xyz, .tech to https://attestat.dev), same file. Whether Porkbun's forwarding serves HTTPS for the HSTS-preloaded .app: unverified, test after saving.
- Decide whether attestat.eu and attestat.de are bought before the submission goes public.
- Files not renamed because other work packages own them: FEEDBACK.md (line 3 says "Project: Nachweis"), DISCLOSURE.md, contracts/ comments and docs, app/src/components/HandoffCard.tsx ("Nachweis Prover" is the phone app's display name and stays).
- Trademark search for "Attestat" in the EU (after 2026-09-13).
