//! Host for the Nachweis PID SP1 spike.
//!
//! Commands:
//!   --check-fixture <sdjwt>   run the shared verification natively on a recorded fixture
//!   --synth --out <dir> [--issuer-exp <unix>]  mint a synthetic SD-JWT PID with nested age_equal_or_over.18
//!   --execute --input <json>  execute the guest, report cycles
//!   --prove --system compressed|groth16|plonk --input <json>  prove, verify, save
//!   --verify <proof.bin>      verify a saved proof with the SP1 verifier
//!
//! --execute and --prove first run the statement natively and check KB-JWT freshness against
//! the wall clock (--kb-window, default 600 s), as the bridge does; --allow-stale-kb skips that
//! check for stored fixtures whose KB-JWT has long expired. The guest itself has no clock.
use alloy_sol_types::SolType;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use clap::{Parser, ValueEnum};
use nachweis_pid_lib::{
    check_kb_freshness, nonce_string, prove_statement_with_facts, verify_presentation, GuestInput,
    PublicValuesStruct,
};
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1ProofWithPublicValues, SP1Stdin,
};
use std::path::PathBuf;
use x509_cert::{der::Decode, Certificate};

const ELF: Elf = include_elf!("nachweis-pid-program");

#[derive(Copy, Clone, PartialEq, Eq, ValueEnum, Debug)]
enum System {
    Compressed,
    Groth16,
    Plonk,
}

#[derive(Parser, Debug)]
struct Args {
    #[arg(long)]
    check_fixture: Option<PathBuf>,
    #[arg(long)]
    synth: bool,
    #[arg(long)]
    out: Option<PathBuf>,
    #[arg(long)]
    execute: bool,
    #[arg(long)]
    prove: bool,
    #[arg(long, value_enum, default_value = "compressed")]
    system: System,
    #[arg(long)]
    input: Option<PathBuf>,
    #[arg(long)]
    verify: Option<PathBuf>,
    /// Header template: an SD-JWT whose issuer JWT header (with x5c) is copied verbatim
    /// so the synthetic issuer JWT has a realistic size. The x5c is not verified by the guest.
    #[arg(long)]
    header_from: Option<PathBuf>,
    /// --synth: issuer credential exp (unix seconds). Default 2027-09-01T00:00:00Z.
    #[arg(long, default_value_t = 1_819_756_800)]
    issuer_exp: u64,
    /// --execute/--prove: KB-JWT freshness window in seconds (exp within, iat not older than).
    #[arg(long, default_value_t = 600)]
    kb_window: u64,
    /// --execute/--prove: skip the KB-JWT freshness pre-check (stored fixtures).
    #[arg(long)]
    allow_stale_kb: bool,
}

fn now_unix() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
}

/// On-disk input for the guest (hex for byte fields).
#[derive(Debug, Serialize, Deserialize)]
struct InputFile {
    presentation: String,
    issuer_key_sec1_hex: String,
    expected_vct: String,
    expected_aud: String,
    bound_address_hex: String,
    challenge_hex: String,
}

impl InputFile {
    fn to_guest(&self) -> GuestInput {
        GuestInput {
            presentation: self.presentation.clone(),
            issuer_key_sec1: hex::decode(&self.issuer_key_sec1_hex).unwrap(),
            expected_vct: self.expected_vct.clone(),
            expected_aud: self.expected_aud.clone(),
            bound_address: hex::decode(self.bound_address_hex.trim_start_matches("0x"))
                .unwrap()
                .try_into()
                .unwrap(),
            challenge: hex::decode(&self.challenge_hex).unwrap().try_into().unwrap(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Calldata {
    system: String,
    vkey: String,
    public_values: String,
    proof: String,
    decoded: DecodedPv,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DecodedPv {
    issuer_key_hash: String,
    vct_hash: String,
    over18: u8,
    subject: String,
    expiry: u64,
    nonce: String,
}

fn b64u(b: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(b)
}

fn leaf_key_from_x5c(issuer_jwt: &str) -> Vec<u8> {
    let h = issuer_jwt.split('.').next().unwrap();
    let hdr: serde_json::Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(h).unwrap()).unwrap();
    let leaf = STANDARD.decode(hdr["x5c"][0].as_str().unwrap()).unwrap();
    let cert = Certificate::from_der(&leaf).unwrap();
    cert.tbs_certificate.subject_public_key_info.subject_public_key.raw_bytes().to_vec()
}

fn sign_jws(header: &str, payload: &str, key: &SigningKey) -> String {
    let h = b64u(header.as_bytes());
    let p = b64u(payload.as_bytes());
    let input = format!("{h}.{p}");
    let sig: Signature = key.sign(input.as_bytes());
    format!("{input}.{}", b64u(&sig.to_bytes()))
}

fn disclosure(salt: &str, name: &str, value: serde_json::Value) -> (String, String) {
    let json = serde_json::to_string(&serde_json::json!([salt, name, value])).unwrap();
    let d = b64u(json.as_bytes());
    let digest = b64u(&Sha256::digest(d.as_bytes()));
    (d, digest)
}

fn synth(out: &PathBuf, header_from: Option<&PathBuf>, issuer_exp: u64) {
    use rand::RngCore;
    let mut rng = rand::thread_rng();
    let issuer = SigningKey::random(&mut rng);
    let holder = SigningKey::random(&mut rng);
    let issuer_pub = issuer.verifying_key().to_encoded_point(false).as_bytes().to_vec();
    let holder_pt = holder.verifying_key().to_encoded_point(false);

    let mut address = [0u8; 20];
    rng.fill_bytes(&mut address);
    let mut challenge = [0u8; 32];
    rng.fill_bytes(&mut challenge);
    let nonce = nonce_string(&address, &challenge);

    // Header: copy a recorded header (with x5c) for realistic size, or a minimal one.
    let header = match header_from {
        Some(p) => {
            let s = std::fs::read_to_string(p).unwrap();
            let h = s.split('~').next().unwrap().split('.').next().unwrap();
            String::from_utf8(URL_SAFE_NO_PAD.decode(h).unwrap()).unwrap()
        }
        None => r#"{"alg":"ES256","typ":"dc+sd-jwt"}"#.to_string(),
    };

    let salt = |i: u8| b64u(&[i; 16]);
    let (d_given, dg_given) = disclosure(&salt(1), "given_name", "Erika".into());
    let (d_family, dg_family) = disclosure(&salt(2), "family_name", "Mustermann".into());
    let (_d_birth, dg_birth) = disclosure(&salt(3), "birthdate", "1964-08-12".into());
    let mut age_digests = Vec::new();
    let mut d_18 = String::new();
    for (i, t) in [12u8, 14, 16, 18, 21, 65].iter().enumerate() {
        let (d, dg) = disclosure(&salt(10 + i as u8), &t.to_string(), true.into());
        if *t == 18 {
            d_18 = d;
        }
        age_digests.push(dg);
    }
    // Issuer credential issued now, expiring at --issuer-exp (about a year ahead by default) so
    // the on-chain decision is live at real time; the KB-JWT mirrors the sandbox wallet
    // (exp = iat + 300), so the fixture's KB-JWT is stale five minutes after minting.
    let iat = now_unix();
    assert!(issuer_exp > iat, "--issuer-exp must lie in the future");
    let payload = serde_json::json!({
        "iss": "https://synthetic-issuer.example/pid-de",
        "vct": "urn:eudi:pid:de:1",
        "iat": iat,
        "nbf": iat,
        "exp": issuer_exp,
        "_sd_alg": "sha-256",
        "cnf": {"jwk": {"kty": "EC", "crv": "P-256",
            "x": b64u(holder_pt.x().unwrap()), "y": b64u(holder_pt.y().unwrap())}},
        "_sd": [dg_given, dg_family, dg_birth],
        "age_equal_or_over": {"_sd": age_digests},
    });
    let issuer_jwt = sign_jws(&header, &serde_json::to_string(&payload).unwrap(), &issuer);
    let sd_part = format!("{issuer_jwt}~{d_given}~{d_family}~{d_18}~");
    let sd_hash = b64u(&Sha256::digest(sd_part.as_bytes()));
    let kb_payload = serde_json::json!({
        "iat": iat, "exp": iat + 300,
        "aud": "https://self-issued.me/v2",
        "nonce": nonce, "sd_hash": sd_hash,
    });
    let kb = sign_jws(
        r#"{"alg":"ES256","typ":"kb+jwt"}"#,
        &serde_json::to_string(&kb_payload).unwrap(),
        &holder,
    );
    let presentation = format!("{sd_part}{kb}");
    std::fs::create_dir_all(out).unwrap();
    std::fs::write(out.join("synthetic-over18.sdjwt"), &presentation).unwrap();
    let input = InputFile {
        presentation,
        issuer_key_sec1_hex: hex::encode(&issuer_pub),
        expected_vct: "urn:eudi:pid:de:1".into(),
        expected_aud: "https://self-issued.me/v2".into(),
        bound_address_hex: format!("0x{}", hex::encode(address)),
        challenge_hex: hex::encode(challenge),
    };
    std::fs::write(out.join("input.json"), serde_json::to_string_pretty(&input).unwrap()).unwrap();
    println!("wrote {}/input.json (issuer JWT {} chars, presentation {} chars)",
        out.display(), input.presentation.split('~').next().unwrap().len(), input.presentation.len());
    let v = verify_presentation(&input.presentation, &issuer_pub, &input.expected_vct, &input.expected_aud);
    println!("native self-check: over18={} expiry={} kb_exp={:?} nonce_ok={}", v.over18, v.expiry, v.kb_exp, v.kb_nonce == nonce);
}

fn decode_pv(bytes: &[u8]) -> DecodedPv {
    let pv = PublicValuesStruct::abi_decode(bytes).unwrap();
    DecodedPv {
        issuer_key_hash: format!("0x{}", hex::encode(pv.issuerKeyHash)),
        vct_hash: format!("0x{}", hex::encode(pv.vctHash)),
        over18: pv.over18,
        subject: format!("{}", pv.subject),
        expiry: pv.expiry,
        nonce: format!("0x{}", hex::encode(pv.nonce)),
    }
}

fn main() {
    sp1_sdk::utils::setup_logger();
    let args = Args::parse();

    if let Some(p) = &args.check_fixture {
        let s = std::fs::read_to_string(p).unwrap();
        let s = s.trim();
        let key = leaf_key_from_x5c(s.split('~').next().unwrap());
        let v = verify_presentation(s, &key, "urn:eudi:pid:de:1", "https://self-issued.me/v2");
        println!("fixture {} verified natively: over18={} expiry={} kb_exp={:?} kb_iat={:?} kb_nonce={}",
            p.display(), v.over18, v.expiry, v.kb_exp, v.kb_iat, v.kb_nonce);
        return;
    }
    if args.synth {
        synth(&args.out.clone().unwrap_or_else(|| PathBuf::from("fixtures")), args.header_from.as_ref(), args.issuer_exp);
        return;
    }
    if let Some(p) = &args.verify {
        let client = ProverClient::builder().cpu().build();
        let pk = client.setup(ELF).expect("setup");
        let proof = SP1ProofWithPublicValues::load(p).expect("load proof");
        client.verify(&proof, pk.verifying_key(), None).expect("verification failed");
        println!("proof {} verified; vkey {}", p.display(), pk.verifying_key().bytes32());
        println!("{}", serde_json::to_string_pretty(&decode_pv(proof.public_values.as_slice())).unwrap());
        return;
    }

    let input_path = args.input.clone().expect("--input required");
    let file: InputFile = serde_json::from_str(&std::fs::read_to_string(&input_path).unwrap()).unwrap();
    let guest = file.to_guest();
    // Host pre-check: the statement natively (fast fail) and KB-JWT freshness against the clock.
    let (_pv, facts) = prove_statement_with_facts(&guest);
    match check_kb_freshness(&facts, now_unix(), args.kb_window) {
        Ok(()) => {}
        Err(e) if args.allow_stale_kb => eprintln!("warning: {e} (--allow-stale-kb)"),
        Err(e) => panic!("KB-JWT freshness pre-check failed: {e}; use --allow-stale-kb for stored fixtures"),
    }
    let mut stdin = SP1Stdin::new();
    stdin.write(&guest);
    let client = ProverClient::from_env();

    if args.execute {
        let (output, report) = client.execute(ELF, stdin).run().expect("execute failed");
        println!("{}", serde_json::to_string_pretty(&decode_pv(output.as_slice())).unwrap());
        println!("total instruction count: {}", report.total_instruction_count());
        println!("syscall count: {}", report.total_syscall_count());
        println!("cycle tracker: {:?}", report.cycle_tracker);
        return;
    }
    if args.prove {
        let pk = client.setup(ELF).expect("setup");
        let t0 = std::time::Instant::now();
        let proof = match args.system {
            System::Compressed => client.prove(&pk, stdin).compressed().run(),
            System::Groth16 => client.prove(&pk, stdin).groth16().run(),
            System::Plonk => client.prove(&pk, stdin).plonk().run(),
        }
        .expect("proving failed");
        let prove_secs = t0.elapsed().as_secs_f64();
        client.verify(&proof, pk.verifying_key(), None).expect("local verification failed");
        let out_dir = input_path.parent().unwrap().to_path_buf();
        let tag = format!("{:?}", args.system).to_lowercase();
        let proof_path = out_dir.join(format!("proof-{tag}.bin"));
        proof.save(&proof_path).expect("save proof");
        println!("proved ({tag}) in {prove_secs:.1} s, verified locally, saved {}", proof_path.display());
        if matches!(args.system, System::Groth16 | System::Plonk) {
            let cd = Calldata {
                system: tag.clone(),
                vkey: pk.verifying_key().bytes32().to_string(),
                public_values: format!("0x{}", hex::encode(proof.public_values.as_slice())),
                proof: format!("0x{}", hex::encode(proof.bytes())),
                decoded: decode_pv(proof.public_values.as_slice()),
            };
            let p = out_dir.join(format!("calldata-{tag}.json"));
            std::fs::write(&p, serde_json::to_string_pretty(&cd).unwrap()).unwrap();
            println!("calldata written to {}", p.display());
        }
        return;
    }
    eprintln!("nothing to do; see --help");
}
