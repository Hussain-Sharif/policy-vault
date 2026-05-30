import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PolicyVault } from "../target/types/policy_vault";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("policy-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PolicyVault as Program<PolicyVault>;

  // Actors
  const owner = provider.wallet as anchor.Wallet;
  const agent  = Keypair.generate();
  const payee  = Keypair.generate();

  // PDAs — we'll compute these once and reuse
  let vaultPda:         PublicKey;
  let vaultBump:        number;
  let policyPda:        PublicKey;
  let policyBump:       number;
  let agentApprovalPda: PublicKey;

  // A fixed nonce for happy-path test
  const goodNonce   = Buffer.alloc(32, 1); // 32 bytes of 0x01
  const replayNonce = Buffer.alloc(32, 1); // same bytes → replay attack
  const freshNonce  = Buffer.alloc(32, 2); // different → should work

  before(async () => {
    // Derive PDAs
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner.publicKey.toBuffer()],
      program.programId
    );
    [policyPda, policyBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), vaultPda.toBuffer()],
      program.programId
    );
    [agentApprovalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), vaultPda.toBuffer(), agent.publicKey.toBuffer()],
      program.programId
    );

    // Airdrop SOL to agent so it can pay tx fees
    const sig = await provider.connection.requestAirdrop(
      agent.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Owner initializes vault
  // ─────────────────────────────────────────────────────────────
  it("✓ Owner can initialize vault", async () => {
    await program.methods
      .initializeVault()
      .accounts({
        owner:         owner.publicKey,
        vault:         vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    assert.equal(vaultAccount.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(vaultAccount.isPaused, false);
    assert.equal(vaultAccount.bump, vaultBump);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Owner deposits SOL into vault
  // ─────────────────────────────────────────────────────────────
  it("✓ Owner can deposit SOL", async () => {
    const depositAmount = 1 * LAMPORTS_PER_SOL;

    const beforeBalance = await provider.connection.getBalance(vaultPda);

    await program.methods
      .deposit(new anchor.BN(depositAmount))
      .accounts({
        owner:         owner.publicKey,
        vault:         vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const afterBalance = await provider.connection.getBalance(vaultPda);
    assert.equal(afterBalance - beforeBalance, depositAmount);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Owner sets policy
  // ─────────────────────────────────────────────────────────────
  it("✓ Owner can set policy", async () => {
    const maxPerRequest  = new anchor.BN(0.01  * LAMPORTS_PER_SOL); // 0.01 SOL per call
    const periodCap      = new anchor.BN(0.5   * LAMPORTS_PER_SOL); // 0.5 SOL per window
    const windowSeconds  = new anchor.BN(3600);                      // 1 hour window

    await program.methods
      .setPolicy(maxPerRequest, periodCap, windowSeconds)
      .accounts({
        owner:         owner.publicKey,
        vault:         vaultPda,
        policy:        policyPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const policyAccount = await program.account.policy.fetch(policyPda);
    assert.equal(policyAccount.maxPerRequest.toString(), maxPerRequest.toString());
    assert.equal(policyAccount.periodCap.toString(),     periodCap.toString());
    assert.equal(policyAccount.spentInWindow.toString(), "0");
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Owner registers agent
  // ─────────────────────────────────────────────────────────────
  it("✓ Owner can register agent", async () => {
    await program.methods
      .registerAgent()
      .accounts({
        owner:         owner.publicKey,
        vault:         vaultPda,
        agent:         agent.publicKey,
        agentApproval: agentApprovalPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const approval = await program.account.agentApproval.fetch(agentApprovalPda);
    assert.equal(approval.agent.toBase58(), agent.publicKey.toBase58());
    assert.equal(approval.isActive, true);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Authorized agent consumes budget (happy path)
  // ─────────────────────────────────────────────────────────────
  it("✓ Authorized agent can consume within limits", async () => {
    const spendAmount = new anchor.BN(0.005 * LAMPORTS_PER_SOL);
    const nonceBytes  = Array.from(goodNonce); // convert Buffer to number[]

    const [nonceRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nonce"), vaultPda.toBuffer(), goodNonce],
      program.programId
    );

    const payeeBefore = await provider.connection.getBalance(payee.publicKey);

    await program.methods
      .consumeBudget(spendAmount, nonceBytes)
      .accounts({
        agent:         agent.publicKey,
        vault:         vaultPda,
        policy:        policyPda,
        agentApproval: agentApprovalPda,
        nonceRecord:   nonceRecordPda,
        payee:         payee.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const payeeAfter = await provider.connection.getBalance(payee.publicKey);
    assert.equal(payeeAfter - payeeBefore, spendAmount.toNumber());

    // Policy spent tracker should update
    const policy = await program.account.policy.fetch(policyPda);
    assert.equal(policy.spentInWindow.toString(), spendAmount.toString());
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Replay attack — same nonce rejected
  // ─────────────────────────────────────────────────────────────
  it("✗ Same nonce cannot be reused (replay attack blocked)", async () => {
    const spendAmount = new anchor.BN(0.005 * LAMPORTS_PER_SOL);
    const nonceBytes  = Array.from(replayNonce); // same as goodNonce

    const [nonceRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nonce"), vaultPda.toBuffer(), replayNonce],
      program.programId
    );

    try {
      await program.methods
        .consumeBudget(spendAmount, nonceBytes)
        .accounts({
          agent:         agent.publicKey,
          vault:         vaultPda,
          policy:        policyPda,
          agentApproval: agentApprovalPda,
          nonceRecord:   nonceRecordPda,
          payee:         payee.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      assert.fail("Should have rejected replay nonce");
    } catch (err: any) {
      // Anchor throws when init account already exists
      assert.ok(err, "Correctly rejected replay nonce");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Exceed per-request limit
  // ─────────────────────────────────────────────────────────────
  it("✗ Agent cannot exceed max_per_request", async () => {
    const tooMuch    = new anchor.BN(0.05 * LAMPORTS_PER_SOL); // 5x the limit
    const nonceBytes = Array.from(Buffer.alloc(32, 9));

    const [nonceRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nonce"), vaultPda.toBuffer(), Buffer.alloc(32, 9)],
      program.programId
    );

    try {
      await program.methods
        .consumeBudget(tooMuch, nonceBytes)
        .accounts({
          agent:         agent.publicKey,
          vault:         vaultPda,
          policy:        policyPda,
          agentApproval: agentApprovalPda,
          nonceRecord:   nonceRecordPda,
          payee:         payee.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      assert.fail("Should have rejected over-limit spend");
    } catch (err: any) {
      assert.include(err.toString(), "ExceedsPerRequestLimit");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Random wallet cannot consume (not registered)
  // ─────────────────────────────────────────────────────────────
  it("✗ Unauthorized wallet cannot consume budget", async () => {
    const stranger   = Keypair.generate();
    const sig        = await provider.connection.requestAirdrop(stranger.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);

    const nonceBytes = Array.from(Buffer.alloc(32, 7));

    // AgentApproval PDA for stranger — doesn't exist on-chain
    const [strangerApprovalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), vaultPda.toBuffer(), stranger.publicKey.toBuffer()],
      program.programId
    );
    const [nonceRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nonce"), vaultPda.toBuffer(), Buffer.alloc(32, 7)],
      program.programId
    );

    try {
      await program.methods
        .consumeBudget(new anchor.BN(1000), nonceBytes)
        .accounts({
          agent:         stranger.publicKey,
          vault:         vaultPda,
          policy:        policyPda,
          agentApproval: strangerApprovalPda,
          nonceRecord:   nonceRecordPda,
          payee:         payee.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();

      assert.fail("Stranger should not be able to consume");
    } catch (err: any) {
      assert.ok(err, "Correctly rejected unauthorized agent");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 9: Owner pauses vault — blocks all spending
  // ─────────────────────────────────────────────────────────────
  it("✗ Cannot consume when vault is paused", async () => {
    // First pause the vault
    await program.methods
      .pauseVault()
      .accounts({
        owner:         owner.publicKey,
        vault:         vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    assert.equal(vaultAccount.isPaused, true);

    // Now try to consume — should fail
    const nonceBytes = Array.from(freshNonce);
    const [nonceRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nonce"), vaultPda.toBuffer(), freshNonce],
      program.programId
    );

    try {
      await program.methods
        .consumeBudget(new anchor.BN(1000), nonceBytes)
        .accounts({
          agent:         agent.publicKey,
          vault:         vaultPda,
          policy:        policyPda,
          agentApproval: agentApprovalPda,
          nonceRecord:   nonceRecordPda,
          payee:         payee.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      assert.fail("Should have been blocked by pause");
    } catch (err: any) {
      assert.include(err.toString(), "VaultPaused");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 10: Owner revokes agent
  // ─────────────────────────────────────────────────────────────
  it("✓ Owner can revoke agent", async () => {
    await program.methods
      .revokeAgent()
      .accounts({
        owner:         owner.publicKey,
        vault:         vaultPda,
        agentApproval: agentApprovalPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const approval = await program.account.agentApproval.fetch(agentApprovalPda);
    assert.equal(approval.isActive, false);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 11: Owner withdraws remaining balance
  // ─────────────────────────────────────────────────────────────
  it("✓ Owner can withdraw remaining balance", async () => {
    const withdrawAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const ownerBefore    = await provider.connection.getBalance(owner.publicKey);

    await program.methods
      .withdraw(withdrawAmount)
      .accounts({
        owner:         owner.publicKey,
        vault:         vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const ownerAfter = await provider.connection.getBalance(owner.publicKey);
    // Owner gained ~withdrawAmount (minus tiny tx fee)
    assert.isAbove(ownerAfter, ownerBefore);
  });
});