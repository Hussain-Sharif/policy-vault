import http from "http";
import { Connection } from "@solana/web3.js";

const PORT = Number(process.env.PORT || 3000);
const PRICE_SOL = Number(process.env.PRICE_SOL || 0.005);
const PRICE_LAM = Math.floor(PRICE_SOL * 1_000_000_000);
const PROGRAM_ID =
  process.env.PROGRAM_ID || "CF7R8RBEwGJtmDtxLkxsLJWWg8TdcQTiEVM34JtDxVLY";
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const connection = new Connection(RPC_URL, "confirmed");
const paidReceipts = new Set<string>();

function setCORS(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/data") {
    const receipt = url.searchParams.get("receipt");

    if (!receipt) {
      res.writeHead(402, {
        "Content-Type": "application/json",
        "X-Payment-Required": "true",
        "X-Payment-Amount": PRICE_LAM.toString(),
        "X-Payment-Currency": "SOL (lamports)",
        "X-Payment-Description": "PolicyVault consume_budget call required",
        "X-Payment-Network": "Solana Devnet",
        "X-Payment-Recipient": PROGRAM_ID,
      });
      res.end(
        JSON.stringify(
          {
            error: "Payment Required",
            code: 402,
            price: `${PRICE_LAM} lamports (${PRICE_SOL} SOL)`,
            instruction:
              "Call PolicyVault.consume_budget, then POST /confirm-payment with txSignature",
          },
          null,
          2
        )
      );
      console.log(`[402] No payment. Required: ${PRICE_LAM} lamports`);
      return;
    }

    if (paidReceipts.has(receipt)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            success: true,
            data: {
              price_feed: "SOL/USD: $185.42",
              block_height: 345_291_847,
              tps: 52_000,
              message:
                "🎯 Premium data unlocked via PolicyVault x402 payment.",
              receipt,
            },
          },
          null,
          2
        )
      );
      console.log(`[200] Data served. Receipt: ${receipt.slice(0, 20)}...`);
      return;
    }

    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          error: "Receipt not found or not yet confirmed on-chain",
          receipt,
        },
        null,
        2
      )
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/confirm-payment") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { txSignature } = JSON.parse(body);
        if (!txSignature) throw new Error("Missing txSignature");

        console.log(
          `[VERIFY] Checking tx on Solana: ${txSignature.slice(0, 30)}...`
        );

        const txInfo = await connection.getTransaction(txSignature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!txInfo) {
          console.log("[REJECT] Transaction not found on-chain");
          res.writeHead(402, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Transaction not found on-chain" }));
          return;
        }

        if (txInfo.meta?.err) {
          console.log("[REJECT] Transaction failed on-chain");
          res.writeHead(402, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Transaction failed on-chain",
              detail: txInfo.meta.err,
            })
          );
          return;
        }

        const keys = txInfo.transaction.message.getAccountKeys().staticAccountKeys;
        const calledVault = keys.some((k) => k.toBase58() === PROGRAM_ID);

        if (!calledVault) {
          console.log("[REJECT] Tx did not call PolicyVault program");
          res.writeHead(402, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Transaction did not call PolicyVault" })
          );
          return;
        }

        paidReceipts.add(txSignature);
        console.log(
          "[VERIFIED ✅] On-chain confirmed. PolicyVault called. Receipt stored."
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            confirmed: true,
            receipt: txSignature,
            message: "Payment verified on Solana. You may now access /data",
          })
        );
      } catch (e: any) {
        console.log(`[ERROR] ${e.message}`);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        server: "PolicyVault x402 API",
        status: "running",
        rpc: RPC_URL,
        program: PROGRAM_ID,
        price_lamports: PRICE_LAM,
        receipts_count: paidReceipts.size,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🚀 PolicyVault x402 API live on port ${PORT}`);
  console.log(`   GET  /data`);
  console.log(`   POST /confirm-payment`);
  console.log(`   GET  /status`);
  console.log(`\n   Program : ${PROGRAM_ID}`);
  console.log(`   RPC     : ${RPC_URL}\n`);
});