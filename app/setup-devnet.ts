import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

async function setup() {
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(
      JSON.parse(
        fs.readFileSync(
          `${process.env.HOME}/.config/solana/id.json`,
          "utf-8"
        )
      )
    )
  );

  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync("target/idl/policy_vault.json", "utf-8")
  );

  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider) as any;

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), wallet.publicKey.toBuffer()],
    programId
  );

  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), vaultPda.toBuffer()],
    programId
  );

  console.log("1. Initializing vault...");
  await program.methods
    .initializeVault()
    .accounts({
      owner: wallet.publicKey,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("2. Depositing 0.5 SOL...");
  await program.methods
    .deposit(new anchor.BN(0.5 * LAMPORTS_PER_SOL))
    .accounts({
      owner: wallet.publicKey,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("3. Setting policy...");
  await program.methods
    .setPolicy(
      new anchor.BN(0.01 * LAMPORTS_PER_SOL),
      new anchor.BN(0.5 * LAMPORTS_PER_SOL),
      new anchor.BN(3600)
    )
    .accounts({
      owner: wallet.publicKey,
      vault: vaultPda,
      policy: policyPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Vault live on devnet!");
  console.log("Vault PDA:", vaultPda.toBase58());
  console.log(
    `Explorer: https://explorer.solana.com/address/${vaultPda.toBase58()}?cluster=devnet`
  );
}

setup().catch((err) => {
  console.error("Setup failed:", err);
});