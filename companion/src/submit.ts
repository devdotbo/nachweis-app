// `submit`: hand the proof to the bridge (POST /sessions/:id/noir-proof) or send attestWithProof
// directly to the AttestationRegistry with a provided key (`--direct`).
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  pad,
  parseAbi,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type SessionFile } from "./session";
import { fetchJson, log, postJson } from "./util";

export const BITS_IDENTITY_OVER18 = 3n;

export function policyIdOf(s: string | undefined): Hex {
  const v = s ?? "nachweis.pid.over18.v1";
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v as Hex;
  return keccak256(toHex(v));
}

export interface BridgeOptions {
  bridgeUrl: string;
  walletKey?: Hex; // signs the EIP-191 address proof
  addressProofSignature?: Hex; // or a signature made elsewhere
  tier?: number;
}

export async function submitToBridge(session: SessionFile, o: BridgeOptions): Promise<Partial<SessionFile>> {
  if (!session.proof) throw new Error("session has no proof; run `prove` first");
  const out: Partial<SessionFile> = { bridge_url: o.bridgeUrl };

  // 1. Bridge session with our challenge, so its nonce equals the one in the proof.
  let bridgeId = session.bridge_session_id;
  let message: string | undefined;
  if (!bridgeId) {
    const { status, body } = await postJson(`${o.bridgeUrl}/sessions`, {
      bound_address: session.bound_address,
      challenge_hex: session.challenge_hex,
    });
    if (status !== 200) throw new Error(`POST /sessions: ${status} ${JSON.stringify(body)}`);
    if (body.nonce !== session.nonce) throw new Error(`bridge nonce ${body.nonce} differs from the relay nonce ${session.nonce}`);
    bridgeId = body.session_id as string;
    message = body.address_proof_message as string;
    log(`bridge session ${bridgeId} (nonce matches the relay session)`);
  }
  out.bridge_session_id = bridgeId;

  // 2. Address proof: the bound address signs "nachweis:session:<id>" (EIP-191).
  if (!session.address_verified) {
    let signature = o.addressProofSignature;
    if (!signature && o.walletKey) {
      const account = privateKeyToAccount(o.walletKey);
      if (account.address.toLowerCase() !== session.bound_address.toLowerCase()) {
        throw new Error(`wallet key is for ${account.address}, the session is bound to ${session.bound_address}`);
      }
      signature = await account.signMessage({ message: message ?? `nachweis:session:${bridgeId}` });
    }
    if (signature) {
      const { status, body } = await postJson(`${o.bridgeUrl}/sessions/${bridgeId}/address-proof`, { signature });
      if (status !== 200) throw new Error(`POST address-proof: ${status} ${JSON.stringify(body)}`);
      out.address_verified = true;
      log("address proof accepted by the bridge");
    } else {
      log(`no wallet key: address proof not sent (sign "nachweis:session:${bridgeId}" with ${session.bound_address} and pass --address-proof-signature, or run the bridge with REQUIRE_ADDRESS_PROOF=false)`);
    }
  }

  // 3. The proof. The bridge never sees the presentation, only these bytes.
  const { status, body } = await postJson(`${o.bridgeUrl}/sessions/${bridgeId}/noir-proof`, {
    proof_hex: session.proof.proof_hex,
    public_inputs_hex: session.proof.public_inputs_hex,
    tier: o.tier ?? 1,
  });
  if (status !== 200) throw new Error(`POST noir-proof: ${status} ${JSON.stringify(body)}`);
  log(`attested by the bridge in tx ${body.tx_hash}`);
  out.tx_hash = body.tx_hash;
  out.attested = body.attested;
  return out;
}

const registryAbi = parseAbi([
  "struct Decision { bytes32 policyId; uint256 bits; uint8 tier; uint64 expiry; bytes32 statusRef; bool revoked; }",
  "function attestWithProof(address subject, Decision decision, bytes proof, bytes32[] publicInputs)",
  "function isEligible(address subject, bytes32 policyId, uint256 requiredBits) view returns (bool)",
  "event Attested(address indexed subject, bytes32 indexed policyId, uint256 bits, uint8 tier, uint64 expiry, bytes32 statusRef, address indexed attester)",
]);

export interface DirectOptions {
  rpcUrl: string;
  registry: Hex;
  senderKey: Hex;
  policyId: Hex;
  tier?: number;
}

/// abi.encode(bytes honkProof, bytes32[] honkPublicInputs), the NoirPidVerifier proof argument.
export function encodeNoirProofArg(proofHex: Hex, publicInputs: Hex[]): Hex {
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes32[]" }], [proofHex, publicInputs]);
}

export async function submitDirect(session: SessionFile, o: DirectOptions): Promise<Partial<SessionFile>> {
  if (!session.proof) throw new Error("session has no proof; run `prove` first");
  const d = session.proof.decoded;
  const account = privateKeyToAccount(o.senderKey);
  const transport = http(o.rpcUrl);
  const pub = createPublicClient({ transport });
  const wallet = createWalletClient({ account, transport });
  const chainId = await pub.getChainId();
  const subject = d.subject as Hex;
  const expiry = BigInt(d.expiry);
  const decision = {
    policyId: o.policyId,
    bits: BITS_IDENTITY_OVER18,
    tier: o.tier ?? 1,
    expiry,
    statusRef: keccak256(toHex(session.session_id)),
    revoked: false,
  };
  const publicInputs: Hex[] = [pad(subject, { size: 32 }), o.policyId, pad(toHex(BITS_IDENTITY_OVER18), { size: 32 }), pad(toHex(expiry), { size: 32 })];
  const proofArg = encodeNoirProofArg(session.proof.proof_hex as Hex, session.proof.public_inputs_hex as Hex[]);
  log(`attestWithProof on ${o.registry} (chain ${chainId}) from ${account.address}: proof arg ${(proofArg.length - 2) / 2} bytes`);
  const { request } = await pub.simulateContract({
    address: o.registry,
    abi: registryAbi,
    functionName: "attestWithProof",
    args: [subject, decision, proofArg, publicInputs],
    account,
  });
  const hash = await wallet.writeContract({ ...request, chain: undefined });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`attestWithProof reverted in ${hash}`);
  const eligible = await pub.readContract({ address: o.registry, abi: registryAbi, functionName: "isEligible", args: [subject, o.policyId, BITS_IDENTITY_OVER18] });
  log(`tx ${hash} mined in block ${receipt.blockNumber}, gas ${receipt.gasUsed}; isEligible(${subject}) = ${eligible}`);
  return { tx_hash: hash, attested: { subject, policy_id: o.policyId, bits: "0x3", expiry: d.expiry, gas_used: receipt.gasUsed.toString(), eligible } };
}

export async function isEligible(rpcUrl: string, registry: Hex, subject: Hex, policyId: Hex): Promise<boolean> {
  const pub = createPublicClient({ transport: http(rpcUrl) });
  return pub.readContract({ address: registry, abi: registryAbi, functionName: "isEligible", args: [subject, policyId, BITS_IDENTITY_OVER18] });
}

export async function bridgeSession(bridgeUrl: string, id: string): Promise<any> {
  const { status, body } = await fetchJson(`${bridgeUrl}/sessions/${id}`);
  if (status !== 200) throw new Error(`GET /sessions/${id}: ${status}`);
  return body;
}
