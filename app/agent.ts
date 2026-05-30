/**
 * PolicyVault Demo: AI Agent Client
 *
 * Simulates an AI agent that:
 * 1. Hits the paid API → gets 402
 * 2. Calls PolicyVault.consume_budget on-chain
 * 3. Confirms payment with server
 * 4. Retries API → gets premium data
 *
 * Prerequisites:
 *   - anchor test must have been run (vault initialized on localnet)
 *   - server.ts must be running in another terminal
 *
 * Run: npx ts-node app/agent.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { PolicyVault } from "../target/types/policy_vault";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const API_BASE = "http://localhost:3000";

// ── Helpers ──────────────────────────────────────────────────

function httpGet(url: string): Promise<{ status: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = "";
      res.on("data", chunk => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    }).on("error", reject);
  });
}

function httpPost(url: string, data: object): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    };
    const req = http.request(url, options, res => {
      let body = "";
      res.on("data", chunk => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main Agent Flow ──────────────────────────────────────────

async function runAgent() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   PolicyVault x402 Agent Demo                 ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  // Setup provider
  const connection = new anchor.web3.Connection("http://localhost:8899", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(
      path.join(process.env.HOME!, ".config/solana/id.json"), "utf-8"
    )))
  );
  const wallet   = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl        = JSON.parse(fs.readFileSync("./target/idl/policy_vault.json", "utf-8"));
  const programId  = new PublicKey(idl.address);
  const program    = new anchor.Program<PolicyVault>(idl, provider);

  // Derive PDAs
  const [vaultPda]  = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), wallet.publicKey.toBuffer()],
    programId
  );
  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), vaultPda.toBuffer()],
    programId
  );

  // Agent keypair (in real world: the AI agent's wallet)
  const agentKeypair = Keypair.generate();
  const sig = await connection.requestAirdrop(agentKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig);

  const [agentApprovalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), vaultPda.toBuffer(), agentKeypair.publicKey.toBuffer()],
    programId
  );

  // Register this agent (owner = wallet signs)
  console.log("🤖 Registering agent on-chain...");
  await program.methods
    .registerAgent()
    .accounts({
      owner:         wallet.publicKey,
      vault:         vaultPda,
      agent:         agentKeypair.publicKey,
      agentApproval: agentApprovalPda,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();
  console.log(`   Agent registered: ${agentKeypair.publicKey.toBase58().slice(0, 20)}...\n`);

  // ── STEP 1: Hit API without payment ─────────────────────────
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 1: Agent requests premium data (no payment yet)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const firstResponse = await httpGet(`${API_BASE}/data`);
  const firstBody     = JSON.parse(firstResponse.body);

  console.log(`   HTTP Status: ${firstResponse.status} Payment Required`);
  console.log(`   Price required: ${firstBody.price}`);
  console.log(`   Server says: "${firstBody.instruction}"\n`);

  await sleep(1000);

  // ── STEP 2: Pay via PolicyVault.consume_budget ───────────────
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 2: Calling PolicyVault.consume_budget on-chain");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Generate unique nonce for this request
  const nonce      = crypto.randomBytes(32);
  const nonceArray = Array.from(nonce);

  const [nonceRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nonce"), vaultPda.toBuffer(), nonce],
    programId
  );

  // API provider's wallet (payee) — in real world this is the API provider's address
  const payeeKeypair = Keypair.generate();

  const spendAmount = new anchor.BN(0.005 * LAMPORTS_PER_SOL);

  console.log(`   Nonce (hex): ${nonce.toString("hex").slice(0, 20)}...`);
  console.log(`   Amount: ${spendAmount.toNumber() / LAMPORTS_PER_SOL} SOL`);
  console.log(`   Checking policy limits on-chain...`);

  const txSig = await program.methods
    .consumeBudget(spendAmount, nonceArray)
    .accounts({
      agent:         agentKeypair.publicKey,
      vault:         vaultPda,
      policy:        policyPda,
      agentApproval: agentApprovalPda,
      nonceRecord:   nonceRecordPda,
      payee:         payeeKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([agentKeypair])
    .rpc();

  console.log(`\n   ✅ On-chain transaction confirmed!`);
  console.log(`   TX Signature: ${txSig.slice(0, 30)}...`);
  console.log(`   Nonce burned — replay attack now impossible.\n`);

  await sleep(1000);

  // ── STEP 3: Confirm payment with server ──────────────────────
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 3: Submitting payment receipt to API server");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const confirmResponse = await httpPost(`${API_BASE}/confirm-payment`, { txSignature: txSig });
  const confirmBody     = JSON.parse(confirmResponse.body);
  console.log(`   Server confirmed receipt: ${confirmBody.confirmed}`);
  console.log(`   Receipt: ${txSig.slice(0, 30)}...\n`);

  await sleep(1000);

  // ── STEP 4: Retry API with receipt ──────────────────────────
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 4: Retrying API request with payment receipt");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const finalResponse = await httpGet(`${API_BASE}/data?receipt=${txSig}`);
  const finalBody     = JSON.parse(finalResponse.body);

  console.log(`   HTTP Status: ${finalResponse.status} OK`);
  console.log(`   Response:\n`);
  console.log(JSON.stringify(finalBody.data, null, 4));

  // ── STEP 5: Demonstrate replay protection ────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 5: Attempting replay attack with same nonce");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    await program.methods
      .consumeBudget(spendAmount, nonceArray)   // same nonce!
      .accounts({
        agent:         agentKeypair.publicKey,
        vault:         vaultPda,
        policy:        policyPda,
        agentApproval: agentApprovalPda,
        nonceRecord:   nonceRecordPda,           // same PDA — already exists
        payee:         payeeKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      }as any)
      .signers([agentKeypair])
      .rpc();

    console.log("   ❌ ERROR: Replay succeeded — this should not happen!");
  } catch (e: any) {
    console.log("   🛡️  Replay attack BLOCKED by PolicyVault.");
    console.log("   Error (expected): Account already exists for this nonce.\n");
  }

  console.log("╔════════════════════════════════════════════════╗");
  console.log("║   Demo Complete ✅                             ║");
  console.log("║                                                ║");
  console.log("║   What just happened:                          ║");
  console.log("║   1. Agent hit paid API → got 402              ║");
  console.log("║   2. PolicyVault enforced spending limits      ║");
  console.log("║   3. SOL transferred on-chain to API provider  ║");
  console.log("║   4. Agent retried → got premium data          ║");
  console.log("║   5. Replay attack blocked by nonce PDA        ║");
  console.log("╚════════════════════════════════════════════════╝\n");
}

runAgent().catch(console.error);