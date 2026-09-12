---
type: reference
title: Two identity-document incidents, September 2026 (IDScan.net, Revolut)
updated: 2026-09-13
sources:
  - https://krebsonsecurity.com/2026/09/fbi-probes-service-selling-153m-drivers-licenses/ (read 2026-09-12)
  - https://idscan.net/notification-data-security-incident/ (read 2026-09-12)
  - https://support.idscan.net/veriscan-cloud-portal/data-collection-and-retention (read 2026-09-12)
  - https://techcrunch.com/2026/09/10/id-verification-giant-idscan-confirms-data-breach-with-more-than-150-million-drivers-licenses-stolen/ (read 2026-09-12)
  - https://www.courtlistener.com/docket/74742547/bunch-v-idscannet-inc/ (read 2026-09-12)
  - https://www.coindesk.com/tech/2026/09/12/bitcoin-activity-passports-exposed-after-revolut-falls-for-fake-government-request (read 2026-09-12 via Parallel Extract, host returns 429 to plain fetches)
  - https://thecybersecguru.com/news/revolut-data-breach-2026/ (read 2026-09-12; quotes the customer notice)
  - https://glitchwire.com/news/revolut-handed-over-passports-bitcoin-records-after-fake-government-request-slip/ (read 2026-09-12)
  - https://beincrypto.com/revolut-data-breach-fake-government-request/ (spokesperson quote; read 2026-09-12 through the mitrade syndication, the origin returns 403 to plain fetches)
  - https://help.revolut.com/help/profile-and-plan/security-and-personal-data/personal-data-queries/what-if-i-want-revolut-to-erase-all-my-data/ (read 2026-09-12)
  - https://cdn.revolut.com/terms_and_conditions/pdf/aml_data_collection_notice_6a1fb2f3_1.0.0_1729618004_en.pdf (read 2026-09-12)
  - https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/subchapter-A/part-1020/subpart-B/section-1020.220 (read 2026-09-12)
  - https://www.legislation.gov.uk/uksi/2017/692/regulation/40/made?view=plain (read 2026-09-12)
  - https://www.coindesk.com/opinion/2026/09/09/kyc-data-is-an-irresistible-honeypot-for-hackers-and-we-must-change-how-it-is-collected (read 2026-09-12 via Parallel Extract)
  - raw/2026-09-12-grok-x-idscan-revolut.txt (Grok web and X run, 143 s)
  - raw/2026-09-12-parallel-task-idscan-revolut.md (Parallel Task pro second opinion)
---

# Two identity-document incidents, September 2026

Researched 2026-09-12 with the tiefgang loop (Perplexity Search, Parallel Search, Brave, Google SERP feeders; primary pages read with the fetch chain; Parallel Task pro as a second opinion; every cited URL link-checked) and one Grok web run for X. Both second opinions were diffed against this page; every item they had that this page lacked was read at its source before it was added. Nothing on this page is from memory.

Why this page exists: the pitch's hero question is "How many strangers keep a copy of your passport?" and the site's status-quo scene carries three older breaches (Coinbase 2025, Ledger 2020, Bit24 2024). Two incidents in the twelve days before the submission deadline make the same point with current dates, one of them in the EU banking system the product targets. The last section says what to do with that.

## Summary in five lines

- IDScan.net (Louisiana, in-person ID scanning for car rental counters, retailers, dispensaries, venues): a dark-web service advertised scans of more than 153 million US and Canadian driver's licences on 2026-08-31; the company confirmed unauthorized access to customer accounts on its cloud in a notice dated 2026-09-04; the FBI is investigating; nine putative class actions were filed in three days.
- The IDScan.net images existed because retention is the product default: the VeriScan cloud portal ships with "Do not delete, retain records in secure cloud", and the Basic plan cannot change it. No US law required a vendor to keep the raw image.
- Revolut (UK and EEA neobank): on 2026-09-11 it notified a "limited number" of customers that it had handed their files, including passport or driving-licence copies, the onboarding selfie, address, IBAN and the full transaction history with bitcoin activity, to a fraudulent request sent from a mailbox inside a real government agency's email domain. Systems and funds untouched. The company notified police and its data-protection and financial regulators.
- The Revolut files existed because a bank must keep them: Revolut's own notices cite a minimum of five to six years' retention of the identity document copy under anti-money-laundering law. The breach was not a stolen archive, it was an authorized disclosure to the wrong requester.
- What both have in common for our pitch: a copy of the document, retained by a party the person never chose, is the asset that leaks. What differs: for IDScan the retention was optional, for Revolut it was mandatory. Attestat's answer fits both: the issuer sees claims once and keeps a decision, not a document, and the chain keeps bits.

## IDScan.net

### Timeline

- 2026-08-31: a new seller on the Exploit forum advertises "Nexus", a searchable service claiming more than 153 million US and Canadian driver's licences, more than 10 million ID cards, more than 3 million travel documents and at least 579,000 medical cards, "continuously exfiltrating new data for over a year" from "a major identity verification company" (FACT, quoted by KrebsOnSecurity 2026-09-01; the seller's claims are CLAIM).
- 2026-09-01: Brian Krebs publishes. His own Virginia licence was the free sample; nine friends and relatives found their licences with timestamps matching a Hertz counter or a Planet13 dispensary scan; the records carry front and back images in visible, infrared and ultraviolet light, the pattern of an authentication scanner. IDScan.net's trust page lists Hertz, Target, FedEx, Motorola Solutions, Jack Henry and Caesars as customers, more than 21 million verifications monthly at more than 20,000 locations. The FBI New Orleans field office opened an inquiry the same day. Nexus went offline hours after publication (FACT, KrebsOnSecurity, read 2026-09-12).
- 2026-09-02: Caesars tells Krebs it stopped using VeriScan in February 2025, had no active account and never authorized IDScan.net to retain its data (FACT, Krebs update 2026-09-02). A vendor kept a former customer's scans; the former customer did not know.
- 2026-09-02 to 2026-09-04: nine putative class actions docketed in the Eastern District of Louisiana (COUNT, zyphe.com case table read 2026-09-12; the first, Bunch v. IDscan.net, Inc., 2:26-cv-01929, filed 2026-09-02, is FACT at CourtListener; BleepingComputer 2026-09-04 confirms "multiple lawsuits" and the FBI's confirmation).
- 2026-09-04: IDScan.net posts a "Notification of Data Security Incident": "on or around September 1, 2026, IDScan.net received information indicating that certain data may have been accessed without authorization"; "an unauthorized third party may have accessed and/or copied certain customer information stored within their accounts on the IDScan.net cloud"; the data "may include full names and driver's license or other government-issued identification numbers"; credit monitoring offered; cooperating with federal law enforcement (FACT, idscan.net notice, read 2026-09-12). The notice names numbers, not images, and gives no count. The page was not indexed or linked from the press section at first (CLAIM, PCMag and Krebs update 2026-09-08).
- 2026-09-10: TechCrunch reports the notice as the company's first acknowledgement and notes that IDScan.net's own 2025 fraud report says it holds more than 150 million driver's licence records (FACT, TechCrunch read 2026-09-12; the 150 million figure is the company's inventory claim, not a victim count).

### What was exposed

- Company wording: full names and driver's licence or other government-issued identification numbers (FACT, notice).
- Marketplace evidence: front and back scans with infrared and ultraviolet pairs, photos, the data printed on the card, cannabis dispensary cards, some records marked CDL or CAC; roughly 1.1 million Canadian licences, Ontario the largest group (FACT that Krebs reported it; the counts are the seller's).
- Not found: Krebs found no passports in the set he searched, although the seller advertised travel documents (FACT, Krebs).
- Unresolved: the gap between "numbers" (company) and "images" (marketplace, authenticated by nine people). The company has not confirmed the 153 million figure, the year-long duration, or which customer accounts were copied (unverified as of 2026-09-12).

### Why the images existed: retention was a product setting

- VeriScan cloud portal, support page "How can I control what visitor data is collected and retained?": three retention options, "Do not delete, retain records in secure cloud", retain anonymized or custom data after a set period, delete all after a set period. "The default setting for new customers is to retain all records in our secure cloud." Purge windows from 8 hours to 1 year exist on higher plans. "The Basic plan's default setting is set to Do not delete and cannot be changed." (FACT, support.idscan.net, read 2026-09-12.)
- US bank customer identification rules require a record of the identifying information and "a description of any document that was relied on", type, number, issuer, dates, kept five years; they do not require the image (FACT, 31 CFR 1020.220(a)(3), read 2026-09-12). IDScan.net is a vendor, not a bank; nothing in the reviewed sources shows a legal duty for it to keep raw scans (Coin Center's Laz Pieper, CoinDesk opinion 2026-09-09: "IDScan is not a financial institution, nor is it required by law to retain anyone's PII", CLAIM by a named author).
- Secondary reporting says the archive was kept "apparently indefinitely" and that no PCI-style deletion standard exists for licence scans (CLAIM, TechTimes 2026-09-03 and 2026-09-04, read 2026-09-12).

### Regulators

FBI investigating (FACT, Krebs; confirmed to BleepingComputer). US Department of Defense "aware and evaluating" the reports of the Defense Secretary's licence (CLAIM, TechCrunch 2026-09-02 as quoted by TechTimes). No state attorney general, FTC or European authority statement found via 6 targeted queries on Perplexity Search, Brave and Google SERP on 2026-09-12; both second opinions report the same absence. Louisiana's breach law gives 60 days from discovery for resident notices (CLAIM, TechTimes citing La. R.S. 51:3071).

### Do not conflate

- GBG's "IDscan" (UK) is a different company (Grok, unverified but plausible; keep the full name IDScan.net in every sentence).
- Jack Henry disclosed a separate vishing incident on 2026-08-31 (CLAIM, Grok citing American Banker).

## Revolut

### Timeline

- Late Friday 2026-09-11 (about 21:59 UTC per one recipient's screenshot, CLAIM, Grok citing an X post by Mark Karpelès): notification emails "Urgent security update about your Revolut account" reach affected customers.
- 2026-09-12: the on-chain investigator ZachXBT posts the notice on Telegram; crypto.news, CoinDesk, BeInCrypto and others report; Revolut gives a spokesperson statement (FACT that the reports exist, read 2026-09-12).

### What the customer notice says (quoted by thecybersecguru.com, read 2026-09-12; consistent with Glitchwire and CoinDesk)

"Revolut received a request for information disguised as a legitimate government agency request. The request originated from an unauthorized email account created directly within an official government authority's domain infrastructure. The communication carried genuine domain authentication credentials leading Revolut to fulfill the request under the reasonable belief that it was an authentic government agency request. Once we became aware of the issue, we independently contacted the relevant government agency to validate the request, ultimately alerting the authority to the unauthorized account apparently operating within their domain. Upon confirming the compromise, Revolut immediately blocked the address across all internal systems, initiated notifications to relevant regulators, and applied precautionary protection measures for affected customers."

Four categories of data "may have been disclosed": identity details (full name, date of birth, occupation); contact details (postal address, email, telephone); document and verification data (copies of passports and driving licences plus the facial verification selfie from onboarding); financial data (account statements with IBAN, account status, opening date and wallet reference number, withdrawal records, the full transaction history including bitcoin). The notice states that "no biometric facial telemetry data was involved or compromised", meaning the face template, not the selfie image (FACT that the quoted notice says so; the notice itself is a customer email, seen only through screenshots and quotes).

### What the company said to the press

"Revolut recently identified a sophisticated external impersonation attack where an unauthorised third party utilised a legitimate government agency domain email to submit fraudulent requests for information ... Revolut systems and customer funds are unaffected." The agency, the police, and its data-protection and financial regulators were alerted; a "limited number" of people affected; the agency is not named because of the live police investigation (FACT, spokesperson to BeInCrypto 2026-09-12, read through the mitrade syndication). CoinDesk: no customer count, no reply to its request for comment (FACT, CoinDesk 2026-09-12).

### Scale and market

Not published. ZachXBT: limited, apparently aimed at high-net-worth users (CLAIM). IBANs point to the EEA banking entity (Revolut Bank UAB, Lithuania) or the UK bank; which entity's customers were hit is unverified. Which regulators were notified is unverified; the 2022 incident's lead authority was Lithuania's State Data Protection Inspectorate (FACT for 2022, SecurityWeek read 2026-09-12).

### Why the files existed: retention is a legal duty for a bank

- Revolut UK help centre: "We're required to keep certain personal data for a minimum of 6 years under Know Your Customer (KYC) and anti-money laundering laws ... This regulation applies to all banks." (FACT, help.revolut.com, read 2026-09-12.)
- Revolut Bank UAB, Irish branch, AML data collection notice: Revolut collects "a copy of the identity document you submit (for example, your passport)", "a video or photograph of your image" and a voice recording; Irish law "requires Revolut to keep a record of the documents used to identify you for the duration of our relationship with you and for a minimum of five years after that relationship ends" (FACT, cdn.revolut.com PDF, read 2026-09-12).
- UK Money Laundering Regulations 2017, regulation 40: keep "a copy of any documents and information obtained ... to satisfy the customer due diligence requirements" for five years after the relationship ends, delete afterwards unless another duty applies (FACT, legislation.gov.uk, read 2026-09-12).
- The disclosure itself was not a stolen archive: it was a request that "passed the checks", answered by staff who believed they were complying with a lawful demand (FACT per the notice). Emergency-data-request fraud against providers has been documented since 2022 (CLAIM, Glitchwire citing Krebs).

### Older Revolut incidents, kept apart

- September 2022: social engineering of staff, 50,150 customers worldwide, about 20,000 in Europe; names, addresses, emails, phone numbers, partial card data; Lithuania's State Data Protection Inspectorate informed (FACT, SecurityWeek 2022, read 2026-09-12). Not identity documents.
- July 2026: a forum post offered 75 million alleged Revolut records for 500 USD; Revolut disputed it (CLAIM, thecybersecguru.com and the Parallel Task run). Unverified either way.

### Regulators

Company says notified. No public statement by the FCA, ICO, PRA, Bank of Lithuania or the Lithuanian data protection authority found via 4 targeted queries on Perplexity Search and Parallel Search (domains revolut.com, ico.org.uk, fca.org.uk and press) on 2026-09-12; the incident is one day old. Both second opinions report the same absence.

## Public reaction (Grok's X search, 2026-09-12; three posts opened and confirmed by the lead)

- Marc Zeller (Aave), 2026-09-12, opened at https://x.com/mzeller/status/2098662798158954690: "Woke up to all my data leaked by @Revolut. Sharp reminder that KYC hasn't produced meaningful upside and has put many in harm's way." (FACT that the post exists with this wording; about 1,100 likes per Grok, COUNT unverified.)
- Mark Karpelès, 2026-09-12, opened at https://x.com/MagicalTux/status/2098669462816018627: article reproducing the notice, "Revolut customers were targeted in a fraudulent emergency data request sent via an email at a 'government agency.'" (FACT that the post exists.)
- vx-underground, 2026-09-02, opened at https://x.com/vxunderground/status/2095014197146861735: "The company which leaked data is IDScan ... If you have ever used these companies (and provided an ID) your data has been leaked", followed by a customer list (FACT that the post exists). Grok's assessment, which the lead shares: the "has been leaked" framing overreaches; the company has not confirmed which customer accounts were copied, and Caesars disputes inclusion.
- Grok also lists posts by ZachXBT (blocked by the Revolut accounts after asking for an official post), Coin Bureau ("They verified the customers better than they verified the government"), Zooko (the Defense Secretary's licence at 100 USD) and recmo (ZK or mobile driving licences instead of stored scans). Not opened by the lead; CLAIM.
- Coin Center's research director in CoinDesk, 2026-09-09, on IDScan.net: "the best way to protect sensitive personal information is to not collect it at all"; "privacy-preserving systems could allow individuals to prove only what a service needs to know, such as their age, eligibility, or authority over an account, while keeping the underlying information under their control" (FACT, read 2026-09-12). CoinDesk's own Revolut report, 2026-09-12: "The breach also gives privacy technologies such as zero-knowledge proofs a more immediate use case" (FACT).

## What this means for the pitch (OPINION, lead, 2026-09-12)

The product sentence does not change. The evidence under the hero question gets two current entries, and one distinction gets sharper.

1. The hero question now has a date. "How many strangers keep a copy of your passport?" was answered on 2026-09-01 with "more than 153 million driver's licences at a scanning vendor most of the owners had never heard of", and on 2026-09-11 with "your bank, which was required to keep the copy, mailed it to a stranger who asked nicely from the right domain". Both fit under the existing site scene "Identity in crypto is still custodial" without a new section.

2. The Revolut case is the one to lead with, for three reasons. It is EU banking, the regulatory home of eIDAS 2 and the product's buyer. It involves bitcoin transaction histories tied to passports, which is the exact link the pitch says should not exist (a document next to on-chain activity). And it shows that retention duties, not carelessness, put the copy in the file: the issuer is obliged to keep what it collected, so the only way to hold less is to collect less. That is the product's claim: accept the wallet's evidence once, keep the decision.

3. The IDScan.net case is the one that proves the "stranger" word. The people in Nexus handed a licence to a rental counter or a dispensary door; the copy went to a vendor with a default of "do not delete", and stayed after the business relationship ended (Caesars). Use it as the second entry, not the first: it is US, in-person, and not a financial institution.

4. Honesty rules for any sentence built on this page:
   - Never write "153 million people". Write "a service advertised scans of more than 153 million driver's licences" or "the vendor says it holds more than 150 million licence records". IDScan.net confirmed access to accounts and named "numbers", not images.
   - Never write "Revolut was hacked". Write "Revolut handed over" or "disclosed to a fraudulent request". Systems and funds were untouched by the company's account.
   - Never give a Revolut victim count. "A limited number of customers" is the company's phrase.
   - The word KYC stays out of our copy (product.md rule); write "identity documents" or "the onboarding file". Quoting Marc Zeller's post verbatim is allowed because it is a quotation, but it is not needed.
   - Do not claim Attestat would have prevented either incident. What can be said: in the Attestat flow the issuer never receives a document image on the browser route, so there is no image to retain, to hoard by default, or to hand to a fraudulent request; a decision record and predicate bits are what remain, and the pitch already says those are personal data too.
   - Do not name Revolut as a prospect, partner or "an instrument like".

5. Concrete proposals, each small, builder decides (nothing applied to the site, the submission text or the shot list by this page):
   - Site, scene "The status quo", breaches grid (nachweis-site/index.html lines 63 to 84): replace the Bit24 card with Revolut, September 2026 ("customers' passports, onboarding selfies, addresses and bitcoin transaction histories handed to a fraudulent request from a real government email domain; the bank was required to keep the copies") and the Ledger card with IDScan.net, September 2026 ("a dark-web service advertised scans of more than 153 million driver's licences from an ID-scanning vendor whose cloud keeps records by default"). Keep Coinbase 2025 as the crypto-exchange entry. Numbers on the cards: Revolut has none, so the big figure would be the date; the IDScan.net card can carry "153 million" only with the word "advertised" beneath it. Source comments in the HTML as the existing cards do.
   - Submission text, "The problem" paragraph: one added sentence after "keeps a copy": "In the two weeks before this submission, a scanning vendor's cloud and a bank's onboarding file both leaked exactly those copies (IDScan.net, 2026-09-01; Revolut, 2026-09-11)." 33 words, keeps the description under 510 words.
   - Video, beat 7 (limits, then stop) is not the place; beat 1 caption or the spoken opening could carry one clause: "This week a bank mailed its customers' passports to a stranger." OPINION: only if the builder wants the video to date itself; the site and the description are the safer carriers.
   - Open question added to open-questions.md: does the builder want the two incidents on the site and in the description before the deadline (owner builder, matters before 2026-09-13 16:00 UTC).

6. Correction 2026-09-13 night (OPINION, lead, on the builder's overnight mandate; decisions.md "2026-09-13 night"): two wordings in this section are withdrawn for public copy. The sentence in item 2 "the only way to hold less is to collect less" is withdrawn: a predicate is not customer due diligence, an obliged entity keeps its compliance file under AMLR Art 22 and Art 77 (CLAIM, product-pitch-legal memo, product.md "What it is not"), and Attestat does not shrink that file; what the browser route removes is the document image the issuer would otherwise receive. The verb "leaked" (used for both cases in product.md:23 and in the description candidate above) is withdrawn: by the companies' accounts the vendor's scans surfaced on a dark-web service after unauthorized account access, and the bank handed the copies to a fraudulent request; neither is a leak from the bank's systems. Applied wording: "surfaced" for IDScan.net, "handed" for Revolut. The research above is unchanged.

## Searched but not found (2026-09-12)

- A regulator statement on either incident: not found via 10 targeted queries across Perplexity Search, Parallel Search (official-domain allowlist), Brave and Google SERP; both second opinions concur. Phrase as "none public as of 2026-09-12", never "no investigation".
- A Revolut customer count, the impersonated agency, or the date the files left: not published.
- A confirmed IDScan.net victim count or list of copied customer accounts: not published.
- The Revolut notice as a document: only screenshots and quotations exist; no Revolut web page carries it (Parallel Search over revolut.com found none).

## Metered spend of this research

Perplexity Search 3 requests, Parallel Search 3 requests, Parallel Extract 4 URLs, Brave 5 requests, Google SERP 2 requests, Parallel Task pro 1 run: about 0.16 USD. Grok run under the subscription, 143 s, reported 0.23 USD informational.
