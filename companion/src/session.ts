// The session file: one JSON document per relay session, mode 0600, in the companion directory.
// It holds the ephemeral private key (JWK with d), the pickup token, the decrypted presentation
// once picked up, and the proof once proved. Nothing in it is ever printed by default.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface SessionFile {
  version: 1;
  created_at: number;
  verifier_url: string;
  bound_address: string; // 0x + 40 lowercase hex
  challenge_hex: string; // 64 hex chars, no 0x
  nonce: string; // 64 lowercase hex chars, as the verifier returns it
  /// Ephemeral P-256 key pair as private JWK (d present). Never leaves this file.
  client_jwk_private: Record<string, string>;
  client_jwk_public: Record<string, string>;
  session_id: string;
  request_uri: string;
  openid4vp_uri: string;
  pickup_url: string;
  pickup_token: string;
  status_url: string;
  response_code?: string;
  /// Written by `pickup`.
  jwe_received_at?: number;
  jwe_protected_header?: Record<string, unknown>;
  presentation?: string; // issuerJwt~d1~...~dN~kbJwt
  vp_credential_id?: string;
  /// Written by `prove`.
  proof?: {
    proof_hex: string;
    public_inputs_hex: string[];
    decoded: DecodedPublicInputs;
    issuer_key_sec1_hex: string;
    expected_aud: string;
    timings_ms: Record<string, number>;
  };
  /// Written by `submit`.
  bridge_url?: string;
  bridge_session_id?: string;
  address_verified?: boolean;
  tx_hash?: string;
  attested?: unknown;
}

export interface DecodedPublicInputs {
  subject: string;
  issuer_key_hash: string;
  over18: number;
  expiry: number;
  nonce: string;
}

export function companionDir(): string {
  return process.env.NACHWEIS_COMPANION_DIR ?? join(homedir(), ".nachweis-companion");
}

export function defaultSessionPath(): string {
  return join(companionDir(), "current.json");
}

export function writeSession(path: string, s: SessionFile): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Write next to the target and rename: the file is either the old or the new version, never half.
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export function readSession(path: string): SessionFile {
  if (!existsSync(path)) throw new Error(`session file ${path} does not exist; run \`request\` first`);
  const s = JSON.parse(readFileSync(path, "utf8")) as SessionFile;
  if (s.version !== 1) throw new Error(`unsupported session file version ${(s as any).version}`);
  return s;
}

/// View of the session without secrets or claims, for `status` and for logging.
export function publicView(s: SessionFile): Record<string, unknown> {
  return {
    session_id: s.session_id,
    verifier_url: s.verifier_url,
    bound_address: s.bound_address,
    nonce: s.nonce,
    request_uri: s.request_uri,
    picked_up: s.presentation !== undefined,
    jwe_received_at: s.jwe_received_at,
    proved: s.proof !== undefined,
    public_inputs: s.proof?.decoded,
    bridge_session_id: s.bridge_session_id,
    tx_hash: s.tx_hash,
  };
}
