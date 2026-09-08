# Spec G0: official test wallet against the blind relay

Status: draft for the gate run. Written before the runbook; the runbook
(/Users/bioharz/git/ethglobal/nachweis-app-wt-circuit/docs/g0-runbook.md)
holds the exact commands.

## Goal

Show that the official German EUDI test wallet (sandbox build, iOS, iPhone
16 Pro Max) can complete one presentation against this project's verifier
running in blind-relay mode, with the laptop companion
(/Users/bioharz/git/ethglobal/nachweis-app-wt-circuit/companion) holding the
decryption key, with the address proof enabled, and that the run leaves a
recorded pass or fail with evidence.

G0 answers one question: does the real wallet produce a response that the
companion can decrypt and prove over, without the verifier ever seeing
plaintext? Everything downstream (native phone proving, on-chain flow,
demo polish) is blocked on this answer.

## Scope

In scope:

- verifier from the relay branch, run locally on the Mac and exposed over
  HTTPS with a public hostname,
- companion on the Mac: create request, pick up the encrypted response,
  decrypt, parse claims, prove, submit,
- one presentation from the official wallet with PID (age and address),
- evidence capture and a decision on the fail branches.

Out of scope:

- native proving on the phone (prover-ios), the bridge mode, SP1 as a
  running component (only named as a fallback),
- any deployment; the public exposure lives only for the run,
- registering a new RP certificate with the sandbox registrar (if the run
  shows that is required, that becomes an open item, not part of G0).

## Preconditions

- Hardware: one iPhone with the official test wallet installed and a PID
  issued from the sandbox issuer; one Mac on the same or any network (the
  wallet reaches the verifier only through the public hostname).
- Verifier worktree
  /Users/bioharz/git/ethglobal/nachweis-verifier-relay on branch
  nachweis-relay builds and its tests pass.
- Registrar leaf certificate and key from
  /Users/bioharz/git/ethglobal/nachweis-verifier-relay/fixtures/live/
  are readable; the trust anchor for the sandbox issuer is configured.
- A tunnel tool that gives a public HTTPS hostname exists on the Mac.
- bun, nargo and bb are installed at the versions pinned in
  /Users/bioharz/git/ethglobal/nachweis-app-wt-circuit/circuits and
  /Users/bioharz/git/ethglobal/nachweis-app-wt-circuit/companion.
- The result endpoint contract of the verifier (result token header, result
  shape) is taken from the verifier's own configuration at run time; the
  runbook does not assume a fixed result shape.

## Pass criteria

G0 passes when all of the following hold for one run:

1. The official wallet accepts the request (QR or link), shows the consent
   screen with the requested PID claims, and posts its response to the
   verifier's response endpoint.
2. The verifier stores the encrypted response and the companion picks it
   up; the pickup succeeds exactly once when single pickup is enabled.
3. The companion decrypts the response with the companion key (the key
   whose public part was placed in the request object), not with any key
   the verifier holds.
4. The key-binding JWT nonce equals hex(sha256(address20 || challenge)) for
   the address and challenge the companion used to create the request.
5. The verifier log for the run contains no plaintext claim, no decrypted
   payload and no companion private key material.
6. The companion prints the parsed claim shape (vct, age object path,
   address fields present) and the payload sizes against the circuit
   bounds.

Evidence for each point is listed in
/Users/bioharz/git/ethglobal/nachweis-app-wt-circuit/docs/evidence/g0-template.md.

## Fail branches

Each branch names the observation, the consequence and the owner of the
follow-up.

- Wallet rejects the request before consent (certificate, client_id or
  hostname mismatch): fix the RP certificate or client_id scheme; G0 is
  not attempted again until the request is accepted. Owner: verifier
  teammate.
- Wallet accepts the request but does not encrypt to the client key given
  in the request (plaintext direct_post, or encryption to a verifier-held
  key): blind relay is not possible with this wallet build. Fall back to
  SP1 verifier mode; the plaintext boundary then lies at the verifier
  process and must be stated in the disclosure. Owner: lead.
- Response decrypts but the age claim shape differs from what the circuit
  parses (different vct, different nesting, no age_equal_or_over object):
  either narrow the claim (age only, address only) or change the circuit
  parser. Owner: circuit teammate.
- Payload sizes exceed the circuit bounds (header 2304, payload 2304, tail
  768, KB payload 384, KB header 128 bytes): WP13 follow-up to raise the
  bounds or trim disclosures. Owner: circuit teammate.
- Nonce mismatch: the wallet does not echo the nonce or transforms it;
  the binding between presentation and address is broken. Investigate the
  request object first. Owner: companion teammate.
- Verifier log contains plaintext: the relay is not blind; fix the log
  path before any evidence is published. Owner: verifier teammate.

## Deliverables of the gate run

- Filled evidence file under
  /Users/bioharz/git/ethglobal/nachweis-app-wt-circuit/docs/evidence/
  (sanitized, see the README there).
- Raw captures only under docs/evidence/private/, which is ignored by git.
- A one-line verdict (pass or fail with branch) reported to the lead.
