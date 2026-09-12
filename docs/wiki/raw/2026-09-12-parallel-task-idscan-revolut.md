Parallel Task API, processor pro, run 2026-09-12 from the tiefgang skill (second opinion arm). Question: IDScan.net incident and Revolut incident 2026, what happened, data exposed, retention, regulators, lawsuits.

# Two 2026 Identity-Data Incidents, Separately Verified

## Executive Summary

- **Incident Status**: The IDScan.net event is confirmed by the company's September 4 notice, although the company has not confirmed the number of people affected or the full document inventory [2]. The September 2026 Revolut event is also company-confirmed, but it was an information-disclosure failure involving a fraudulent government request, not a demonstrated compromise of Revolut's core systems [11].
- **Scale**: A dark-web service advertised more than 153M US and Canadian driver's-license scans, plus other identity documents, in the IDScan matter, but that is an advertised inventory rather than a confirmed victim count [6][3]. Revolut has disclosed only a "limited number" or otherwise unspecified number of customers [7].
- **Data Sensitivity**: IDScan's own notice identifies possible full names and driver's-license or other government-issued identification numbers; independent reporting found front/back, infrared and ultraviolet document images, while passports, dates of birth, addresses and selfies are not confirmed by the company's notice [2][6]. Revolut's account of the later event includes passports or driving licences, verification selfies, names, dates of birth, addresses and extensive account and Bitcoin records [10].
- **Geographic Exposure**: The IDScan advertisement claimed US and Canadian records, but IDScan has not published a confirmed country list [3]. Revolut has published no country list or exact victim count for the September incident [10].
- **Retention**: Neither incident notice says that raw identity images had to be kept for a particular period. IDScan's privacy policy gives a purpose-based standard, while Revolut's UK privacy notice says it generally keeps personal data for no more than seven years after the relationship ends because of KYC, AML and banking laws [12][1]. That does not establish that every raw scan or selfie must be retained for the entire period.
- **Regulators and Litigation**: The FBI said it opened an inquiry into the IDScan matter [6]. Revolut said it notified police, financial regulators and data-protection regulators, but it did not name them [11]. I located no public FCA, ICO, EU DPA or US state AG statement about either 2026 event as of September 12, 2026, and no verified court docket naming a filed Revolut suit. Several IDScan lawsuits were reported, but the sources reviewed did not establish a complete docket or complaint list [3].

## What Is Actually Confirmed, and What Is Not

The two matters should not be treated as equivalent. IDScan is an identity-verification vendor whose cloud accounts held data uploaded or generated for business customers. Its September 4, 2026 notice says that on or around September 1 it received information indicating that data may have been accessed without authorization, engaged outside specialists and determined that an unauthorized third party may have accessed or copied customer information stored in customer accounts on the IDScan cloud [2]. This is a confirmed security incident, but the company's cautious wording leaves the final scope open.

The public IDScan chronology began with Brian Krebs's September 1 reporting about Nexus, a dark-web identity-theft service advertised on the Exploit forum [6]. IDScan's notice was dated September 4 [2]. TechCrunch described the notice as the company's first acknowledgement that a hack had occurred and reported it on September 10 [5]. Thus, "discovery" has two meanings: the public researcher discovery on September 1 and IDScan's stated receipt of information about possible unauthorized access on or around that date. The company's formal disclosure date was September 4.

The later Revolut event is a different kind of confirmed incident. On September 12, reporting based on Revolut's spokesperson and customer notices said that a fraudulent request using a legitimate government-agency email domain passed the company's checks, and Revolut supplied customer files before verifying that the request was fraudulent [11]. Revolut then blocked the sender, notified the agency, alerted police and regulators, and notified affected customers [11]. The report says the event occurred "late Friday," but the company did not publish a precise event or discovery date [10]. The safest disclosure date is September 12, the date of the public report and company confirmation.

**Decision-ready insight:** Treat IDScan as a potentially large cloud-data compromise with an unconfirmed final population, and Revolut as a confirmed social-engineering disclosure with an undisclosed small population. Do not combine their advertised or reported numbers.

## IDScan.net: Exposure, Scale, Customers and Litigation

### What happened and what data was exposed

Nexus advertised searchable access to more than 153M driver's-license scans belonging to people in the United States and Canada [3]. Krebs also reported more than 10M state identification cards, more than 3M travel documents or international IDs, and at least 579,000 medical cards [3]. The reported records included front and back license images and infrared and ultraviolet versions, sometimes with filenames containing dates and timestamps [6]. Those details explain why the event is more serious than a simple leak of typed names: high-fidelity document images can support impersonation and document fraud.

The critical qualification is that the Nexus inventory is not the same thing as a confirmed number of affected individuals. IDScan's notice says only that an unauthorized party may have accessed or copied certain information stored in customer cloud accounts and that the information may include full names and driver's-license or other government-issued identification numbers [2]. IDScan did not provide a count of affected people, a country-by-country breakdown or a definitive list of all document types. TechCrunch reported that the company's systems hold more than 150M driver's-license records, but that remains a database or inventory figure, not a confirmed number of victims [5].

The company's notice also does not confirm selfies, dates of birth, residential addresses, passport images or medical details. Independent reporting links the advertised database to IDScan through records verified by individuals and timestamps associated with ID checks, including a Hertz rental and a Las Vegas trip involving Planet13, TSA and the Aria [6]. Those links identify likely downstream touchpoints, not proof that Hertz, Planet13, TSA or the Aria were themselves breached or that every record from those businesses was exposed.

### Downstream businesses and lawsuits

IDScan serves businesses that authenticate government IDs. Reporting identifies banks, cannabis retailers and gun stores among the affected service ecosystem [3], while the company's own public materials describe finance, hospitality, gaming, retail and automotive use cases. The evidence does not establish which downstream customers' data was actually in the stolen set. A proper customer-impact statement therefore remains: potentially affected individuals whose data was stored in IDScan customer accounts, with specific client attribution unresolved.

Several lawsuits were reported in the days after the disclosure [3]. However, the material reviewed here does not provide reliable case numbers, named plaintiffs, courts or a complete list of complaints. A law firm's September 11 press release announced an investigation into possible claims, which is not the same as a filed class action. The litigation status should therefore be stated as "reported lawsuits and investigations, with the complete verified docket not established in the reviewed sources," rather than as a precise count.

**Decision-ready insight:** Downstream companies should not assume that a public IDScan customer logo proves exposure. They should map which IDScan account, workflow, location and retention setting held their customers' data, then notify based on confirmed records rather than the 153M advertisement.

## Revolut: Confirmed September Disclosure, Plus Two Confusable Older Claims

### The September 2026 event

The September event involved a fraudulent government request rather than evidence that an attacker penetrated Revolut's core banking systems. Hackers used an email account on a legitimate government-agency domain and valid domain-authentication credentials; Revolut treated the requests as genuine and fulfilled them [11]. After verification with the agency, Revolut blocked the address and said its systems and customer funds were unaffected [11].

The exposed material was unusually broad. Reporting based on Revolut's disclosure lists full names, dates of birth, occupations, postal addresses, email addresses, telephone numbers, passports and/or driving licences, facial-verification images, account statements containing IBANs, account status, account opening dates, wallet reference numbers, withdrawal records and complete transaction histories, including Bitcoin transactions [11]. CoinDesk likewise described passports, selfies and home addresses and said no customer funds were lost [10]. The sources do not establish that biometric facial telemetry, passwords, passcodes or login credentials were disclosed; Revolut said customer funds and core systems remained secure [7].

Revolut has not disclosed an exact victim count or country list. It described the affected group as limited or referred to affected customers without quantifying them [7][10]. The event's downstream population is therefore Revolut customers whose files were responsive to the fraudulent requests, not a named set of merchants or banking partners. No source reviewed identifies a particular business customer as affected.

### The July 2026 75M allegation

A separate July 29 forum post advertised 75M alleged Revolut records for $500 [4]. Researchers described fields such as names, email addresses, phone numbers, addresses, account identifiers, device data, partial card details and hashed credentials [4]. Revolut said there was no verifiable record count, no meaningful sample and no technical evidence of unauthorized access, and suggested that the material could have been aggregated from prior breaches or third parties [4]. As of that report, the allegation was unverified [4]. It should not be merged with the September government-request disclosure.

### The 2022 breach

The older Revolut incident affected roughly 50,150 customers worldwide, including approximately 20,000 in Europe. The reported data included names, addresses, telephone numbers, email addresses, partial card data and some account details; the access resulted from social engineering, and Lithuania's State Data Protection Inspectorate was the named regulator [13]. That is a separate 2022 event, not the September 2026 government-request disclosure.

**Decision-ready insight:** The correct Revolut label is "confirmed September 2026 unauthorized disclosure following a fraudulent government request; exact scope undisclosed." The July 75M claim remains unverified, and the 50,150 figure belongs to 2022.

## Retention, KYC/AML Duties and the Limits of the Public Record

### IDScan

IDScan's September incident notice does not explain why identity images were retained or state a deletion date. It refers only to information stored within customer accounts on the IDScan cloud and to possible full names and government-issued identification numbers [2]. Its privacy policy says that IDScan processes client data for business customers and that the applicable client agreement and privacy policy govern that client data [12]. The policy says information is retained for as long as reasonably necessary for the original purpose and as necessary for legal obligations, dispute resolution, fraud prevention and enforcement of agreements [12]. It gives no image-specific retention period.

That distinction matters legally. IDScan is a technology vendor, while the downstream bank, exchange, casino, retailer or other regulated customer may have its own KYC, AML, age-verification or recordkeeping obligations. The sources do not show that AML law required IDScan itself to retain every raw scan, or that a particular customer required retention of every image for a fixed period. The responsible answer is therefore: legal retention may apply to particular records and customers, but the 2026 notice does not establish a legal requirement to retain all identity images.

### Revolut

Revolut's UK privacy notice states that it collects copies of passports or driving licences and photo or video images and facial-scan data for onboarding KYC, authentication and fraud prevention [1]. It expressly says that some personal data must be collected and stored under AML laws [1]. Its retention section says data is kept for the original purpose, legitimate interests and relevant laws, and that KYC, AML and banking laws require certain personal data to be kept for specified periods [1]. For the UK, the notice says Revolut will generally keep personal data for no more than seven years after the business relationship ends, subject to longer retention for litigation or another legal reason [1].

The cited UK Money Laundering Regulations provision says a relevant person is not required to keep the specified records for more than 10 years [8]. That is a ceiling for the records covered by the provision, not proof that raw passport images or selfies must be held for ten years. Revolut's notice also does not say that every identity image or biometric selfie must be retained for the full seven-year period [1].

**Decision-ready insight:** KYC and AML rules explain why some identity records remain in regulated financial systems, but they do not by themselves prove that indefinite storage, full-resolution images or every selfie is legally necessary. The unanswered control question is which exact fields were retained, under which entity's policy, for which legal obligation and with what deletion trigger.

## Regulators, Law Enforcement and Lawsuits as of September 12, 2026

The IDScan matter has the clearest public law-enforcement development: the New Orleans FBI field office opened an official investigation into the apparent breach [6]. IDScan also said it engaged third-party specialists and was investigating the scope [2]. I found no public statement from the FCA, UK ICO, a named EU data-protection authority or a US state attorney general specifically addressing the 2026 IDScan incident. That absence should be reported as "no public statement located in the reviewed sources," not as proof that no regulator was notified.

Revolut said it notified police, financial regulators and data-protection regulators and affected customers [11]. The public report did not name the FCA, ICO, Bank of Lithuania, Lithuania's State Data Protection Inspectorate or any other authority as having issued a statement. The 2022 Lithuanian regulator reference belongs to the older 50,150-customer incident [13] and should not be presented as a 2026 finding. I also found no public FCA, ICO or EU DPA enforcement statement about the September 2026 event as of the cutoff date.

The litigation evidence is similarly asymmetric. Several IDScan lawsuits were reported soon after the disclosure [3], and law firms publicly announced investigations. But the reviewed sources did not provide a complete, independently verified list of complaint numbers, plaintiffs, courts or causes of action. For Revolut, the September report mentions notifications to regulators and customers but no lawsuit [11]. The July 75M allegation also does not become a lawsuit merely because researchers discussed it.

| Question | IDScan.net | Revolut September 2026 |
|---|---|---|
| Confirmed event | Possible unauthorized access/copying in customer cloud accounts | Fraudulent government request accepted as genuine and customer files sent |
| Public discovery/disclosure | Krebs report and Nexus advertisement on Sept. 1; company notice dated Sept. 4 | Public company/media disclosure on Sept. 12; exact internal discovery date not stated |
| Confirmed people | Not disclosed | Not disclosed; limited number only |
| Countries | Advertisement said US and Canada; company confirmation absent | Not disclosed |
| Regulator status | FBI inquiry; no named privacy regulator statement located | Company says police and regulators notified; no named regulator statement located |
| Lawsuits | Several reported, complete verified docket not established here | None identified in reviewed sources |

The table's practical takeaway is that neither incident supports a precise victim-country matrix yet. IDScan has a much larger advertised inventory, while Revolut has a more specific description of the fields sent but a much smaller and undisclosed population.

**Decision-ready insight:** Public communications should separate confirmed company statements, independent observations, advertised dark-web inventories and legal claims. Conflating those categories would overstate both incidents and could misdirect customer notification.

## Synthesis: Different Failure Mechanisms, Different Evidence Problems

The incidents differ along four dimensions. First is mechanism: IDScan concerns possible unauthorized access or copying from a cloud environment, whereas Revolut concerns an authorized internal disclosure induced by a fraudulent request [2][11]. Second is scope evidence: IDScan has a very large advertised inventory but no company-confirmed victim count; Revolut has detailed fields but no count or country list [3][10]. Third is affected-party structure: IDScan sits between many downstream businesses and their customers, while Revolut's September event concerns direct Revolut customers whose files matched the requests. Fourth is retention accountability: IDScan's customer contracts and configurations may determine why data was held, while Revolut's own privacy notice directly links collection and storage to KYC, AML and banking rules [12][1].

The non-obvious tension is that the more detailed Revolut disclosure does not make its scale clearer. Revolut can describe passports, selfies, addresses and transaction histories while still withholding the number of affected people and countries. Conversely, the IDScan case has a dramatic number and detailed image formats, but the company's notice describes only possible access and possible categories. In both cases, public attention is being driven by the most alarming available artifact - a dark-web advertisement in one case and highly sensitive sample fields in the other - rather than a completed forensic victim table.

The older Revolut events show why incident naming matters. The 2022 breach involved approximately 50,150 customers and social engineering, while the July 2026 75M listing was denied and unverified [13][4]. Neither should be used as the count for the September 2026 fraudulent-request event. A defensible risk register should therefore maintain three separate Revolut entries and one IDScan entry, each with its own event date, evidence status, data fields, regulator status and legal record.

The best operational response follows from the mechanism. IDScan customers should preserve cloud-account logs, determine which workflows stored images, and reconcile customer-level notifications against actual access evidence. Revolut should preserve the fraudulent request, authentication logs, responsive files and verification timeline, then disclose the exact count and jurisdictions when forensics permit. For both, retention schedules should distinguish legally required KYC records from optional raw images and derived biometric data.

## References

1. *Customer Privacy Notice | Revolut United Kingdom*. https://www.revolut.com/legal/privacy/
2. *Notification of Data Security Incident - IDScan.net*. https://idscan.net/notification-data-security-incident
3. *IDScan confirms breach after hackers offer 153 million driver’s license scans for sale  | The Record from Recorded Future News*. https://therecord.media/idscan-data-breach-notice-drivers-licenses
4. *Revolut Data Breach: 75 Million Records Alleged Sale*. https://cypro.co.uk/insights/cyber-bulletins/revolut-data-breach-allegations-75-million-records-at-risk
5. *ID verification giant IDScan confirms data breach with more than 150 million driver's licenses stolen | TechCrunch*. https://techcrunch.com/2026/09/10/id-verification-giant-idscan-confirms-data-breach-with-more-than-150-million-drivers-licenses-stolen
6. *FBI Probes Service Selling 153M+ Drivers Licenses – Krebs on Security*. https://krebsonsecurity.com/2026/09/fbi-probes-service-selling-153m-drivers-licenses/
7. *Revolut Confirms Sending Passport and Bitcoin Records to Fake Government Email*. https://beincrypto.com/revolut-data-breach-fake-government-request
8. *The Money Laundering, Terrorist Financing and Transfer of ...*. https://www.legislation.gov.uk/uksi/2017/692/regulation/40/made?view=plain
9. *IDScan confirms breach after 153 million driver’s licenses leak on dark web*. https://www.helpnetsecurity.com/2026/09/11/idscan-net-data-breach-153-million-drivers-licenses
10. *Bitcoin activity, passports exposed after Revolut falls for fake government request*. https://www.coindesk.com/tech/2026/09/12/bitcoin-activity-passports-exposed-after-revolut-falls-for-fake-government-request
11. *Revolut Gave Customer Data to Scammers After Fake Government Requests*. https://hackread.com/revolut-gave-customer-data-to-scammers-fake-requests/
12. *Privacy Policy 2026 Legal - IDScan.net*. https://www.idscan.net/privacy-policy/
13. *Over 50,000 Revolut Customers Affected by Data Breach - SecurityWeek*. http://securityweek.com/over-50000-revolut-customers-affected-data-breach


## Citations
- https://www.revolut.com/legal/privacy/ (Customer Privacy Notice | Revolut United Kingdom)
- https://idscan.net/notification-data-security-incident (Notification of Data Security Incident - IDScan.net)
- https://therecord.media/idscan-data-breach-notice-drivers-licenses (IDScan confirms breach after hackers offer 153 million driver’s license scans for sale  | The Record from Recorded Future News)
- https://cypro.co.uk/insights/cyber-bulletins/revolut-data-breach-allegations-75-million-records-at-risk (Revolut Data Breach: 75 Million Records Alleged Sale)
- https://techcrunch.com/2026/09/10/id-verification-giant-idscan-confirms-data-breach-with-more-than-150-million-drivers-licenses-stolen (ID verification giant IDScan confirms data breach with more than 150 million driver's licenses stolen | TechCrunch)
- https://krebsonsecurity.com/2026/09/fbi-probes-service-selling-153m-drivers-licenses/ (FBI Probes Service Selling 153M+ Drivers Licenses – Krebs on Security)
- https://beincrypto.com/revolut-data-breach-fake-government-request (Revolut Confirms Sending Passport and Bitcoin Records to Fake Government Email)
- https://www.legislation.gov.uk/uksi/2017/692/regulation/40/made?view=plain (The Money Laundering, Terrorist Financing and Transfer of ...)
- https://www.helpnetsecurity.com/2026/09/11/idscan-net-data-breach-153-million-drivers-licenses (IDScan confirms breach after 153 million driver’s licenses leak on dark web)
- https://www.coindesk.com/tech/2026/09/12/bitcoin-activity-passports-exposed-after-revolut-falls-for-fake-government-request (Bitcoin activity, passports exposed after Revolut falls for fake government request)
- https://hackread.com/revolut-gave-customer-data-to-scammers-fake-requests/ (Revolut Gave Customer Data to Scammers After Fake Government Requests)
- https://www.idscan.net/privacy-policy/ (Privacy Policy 2026 Legal - IDScan.net)
- http://securityweek.com/over-50000-revolut-customers-affected-data-breach (Over 50,000 Revolut Customers Affected by Data Breach - SecurityWeek)
