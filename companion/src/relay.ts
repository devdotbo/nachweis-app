// Client for the verifier's blind relay (verifier-service/src/relay.rs, docs/blind-relay.md).
import { splitJws, type Jwk } from "./crypto";
import { fetchJson, postJson } from "./util";

export interface RelayCreated {
  session_id: string;
  request_uri: string;
  openid4vp_uri: string;
  nonce: string;
  bound_address: string;
  pickup_url: string;
  pickup_token: string;
  status_url: string;
  response_code?: string;
}

export async function createRelayRequest(
  verifierUrl: string,
  clientJwk: Jwk,
  boundAddress: string,
  challengeHex: string,
  redirectUri?: string,
): Promise<RelayCreated> {
  const body: Record<string, unknown> = {
    client_jwk: { ...clientJwk, use: "enc", alg: "ECDH-ES" },
    bound_address: boundAddress,
    challenge: "0x" + challengeHex,
  };
  if (redirectUri) body.redirect_uri = redirectUri;
  const { status, body: out } = await postJson(`${verifierUrl}/relay/request`, body);
  if (status !== 201) throw new Error(`POST /relay/request: ${status} ${JSON.stringify(out)}`);
  return out as RelayCreated;
}

export interface RequestObject {
  payload: any;
  encryptionKey: Jwk;
  clientId: string;
  nonce: string;
  responseUri: string;
  credentialId: string;
}

/// Fetch the signed request object the wallet will see and read the fields a client checks.
export async function fetchRequestObject(requestUri: string): Promise<RequestObject> {
  const r = await fetch(requestUri);
  if (!r.ok) throw new Error(`GET ${requestUri}: ${r.status}`);
  const jar = (await r.text()).trim();
  const { payload } = splitJws(jar);
  const keys = payload?.client_metadata?.jwks?.keys;
  if (!Array.isArray(keys) || keys.length !== 1) throw new Error("request object does not advertise exactly one encryption key");
  return {
    payload,
    encryptionKey: keys[0],
    clientId: payload.client_id,
    nonce: payload.nonce,
    responseUri: payload.response_uri,
    credentialId: payload?.dcql_query?.credentials?.[0]?.id ?? "pid",
  };
}

/// The one check docs/blind-relay.md asks a client to make before it shows the QR: the request the
/// wallet will encrypt to carries OUR key and OUR nonce, not a key the server swapped in.
export function assertRequestIsOurs(ro: RequestObject, ourPublic: Jwk, ourNonce: string): void {
  if (ro.encryptionKey.x !== ourPublic.x || ro.encryptionKey.y !== ourPublic.y) {
    throw new Error("the signed request advertises a different encryption key than ours; the relay is not blind");
  }
  if (ro.nonce !== ourNonce) throw new Error(`the signed request carries nonce ${ro.nonce}, expected ${ourNonce}`);
  if (ro.payload.response_mode !== "direct_post.jwt") throw new Error(`response_mode is ${ro.payload.response_mode}, expected direct_post.jwt`);
}

export type RelayStatus = "pending" | "responded" | "picked_up";

export async function relayStatus(statusUrl: string): Promise<RelayStatus> {
  const { status, body } = await fetchJson(statusUrl);
  if (status !== 200) throw new Error(`GET ${statusUrl}: ${status} ${JSON.stringify(body)}`);
  return body.status as RelayStatus;
}

export interface Pickup {
  jwe: string;
  nonce: string;
  bound_address: string;
  received_at: number;
}

export async function pickupResponse(pickupUrl: string, token: string): Promise<Pickup> {
  const { status, body } = await fetchJson(pickupUrl, { headers: { "x-pickup-token": token } });
  if (status === 410) throw new Error("the response was already picked up (one-time pickup); nothing is stored any more");
  if (status !== 200) throw new Error(`GET ${pickupUrl}: ${status} ${JSON.stringify(body)}`);
  return body as Pickup;
}

/// What a wallet does after consent: POST the JWE as the `response` form field to response_uri.
export async function postWalletResponse(responseUri: string, jwe: string): Promise<{ status: number; body: any }> {
  const form = new URLSearchParams({ response: jwe });
  return fetchJson(responseUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}
