# ZK Selective Disclosure

This repo now includes a Groth16 selective-disclosure path for ore records that matches the paper's core pattern:

1. Store a commitment on-chain when the ore record is created.
2. Keep sensitive values off-chain.
3. Later prove a predicate over those hidden values without revealing them.

## What is hidden

The Groth16 circuit currently hides:

- `countryCode`
- `gradeValue`
- `salt`

The on-chain ore record created through `registerOrePrivate` stores placeholder values:

- `originCountry = "PRIVATE"`
- `estimatedGrade = "PRIVATE"`

The real hidden values are represented only by a Poseidon commitment.

## What is proven

The current circuit proves both:

- the hidden country is one of three approved countries
- the hidden grade is greater than or equal to a public minimum threshold

Public inputs to the verifier are:

1. `commitment`
2. `minGrade`
3. `approvedCountryA`
4. `approvedCountryB`
5. `approvedCountryC`

## Main files

- `zk/circuits/ore_selective_disclosure.circom`
- `contracts/generated/OreSelectiveDisclosureVerifier.sol`
- `src/services/zk-ore-proof.js`
- `scripts/build-zk.mjs`
- `scripts/test-zk-flow.cjs`

## Build and test

```bash
npm run zk:build
npm run zk:test
```

## API flow

Protected endpoints:

- `POST /api/zk/ore/register-private`
- `GET /api/zk/ore/:oreId/commitment`
- `POST /api/zk/ore/:oreId/prove`
- `POST /api/zk/ore/:oreId/verify`
- `POST /api/zk/verifier`

## Important limitation

This improves the repo's alignment with the article, but it does not make the entire platform private.

Still public today:

- `mineId`
- `mineralType`
- `weightGrams`
- `currentCustodian`

So this is a real Groth16 selective-disclosure implementation for origin and grade predicates, not yet full end-to-end commercial confidentiality.
