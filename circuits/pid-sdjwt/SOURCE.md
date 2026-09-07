# Source

Copied from https://github.com/eid-privacy/zkp-pocs, path `noir/d10_swiyu_jwt`,
commit ebbc17c86551d7407fa547342c35d06e2122c302 (2026-09-02).

License: MPL-2.0 (see LICENSE.md, copied verbatim from the repository root).
Published figure for the unmodified circuit: 18.4 s native proving on a Galaxy A54
(Barretenberg UltraHonk via zkmopro noir-rs).

The `data/` folder, `Prover.toml` and `README.md` at this commit are the upstream
originals for the Swiss swiyu SD-JWT vector; they were kept for the baseline
measurement. The adapted circuit for the German EUDI PID lives in `src/` and is
described in ADAPTATION.md.
