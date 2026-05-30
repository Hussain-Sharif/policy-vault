/**
 * PolicyVault Demo: Paid API Server (x402-style)
 *
 * Simulates an API that requires payment before serving data.
 * Real x402 flow: client hits endpoint → gets 402 → pays → retries → gets data.
 *
 * Run: npx ts-node app/server.ts
 */

import http from "http";
import crypto from "crypto";

const PORT      = 3000;
const PRICE_SOL = 0.005; // 0.005 SOL per request
const PRICE_LAM = PRICE_SOL * 1_000_000_000;

// In-memory store of paid receipts (in production: verify on-chain)
const paidReceipts = new Set<string>();

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // ── Route: GET /data ────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/data") {
    const receipt = url.searchParams.get("receipt");

    // No receipt → 402 Payment Required
    if (!receipt) {
      res.writeHead(402, {
        "Content-Type":           "application/json",
        "X-Payment-Required":     "true",
        "X-Payment-Amount":       PRICE_LAM.toString(),
        "X-Payment-Currency":     "SOL (lamports)",
        "X-Payment-Description":  "PolicyVault consume_budget call required",
        "X-Payment-Network":      "Solana Devnet",
      });
      res.end(JSON.stringify({
        error:       "Payment Required",
        code:        402,
        price:       `${PRICE_LAM} lamports (${PRICE_SOL} SOL)`,
        instruction: "Call PolicyVault.consume_budget, then retry with ?receipt=<tx_signature>",
      }, null, 2));

      console.log(`[402] Client hit /data without payment. Told to pay ${PRICE_LAM} lamports.`);
      return;
    }

    // Has receipt → verify it's been submitted (demo: just check it's in our set)
    if (paidReceipts.has(receipt)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        data:    {
          price_feed:    "SOL/USD: $185.42",
          block_height:  345_291_847,
          tps:           52_000,
          message:       "🎯 Premium data unlocked via PolicyVault payment.",
          receipt:       receipt,
        },
      }, null, 2));

      console.log(`[200] Payment verified. Served premium data. Receipt: ${receipt.slice(0, 20)}...`);
      return;
    }

    // Receipt submitted but not registered yet
    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error:   "Receipt not found or not yet confirmed",
      receipt: receipt,
    }, null, 2));
    return;
  }

  // ── Route: POST /confirm-payment ────────────────────────────
  // Agent calls this after submitting consume_budget on-chain
  if (req.method === "POST" && url.pathname === "/confirm-payment") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const { txSignature } = JSON.parse(body);
        if (!txSignature) throw new Error("Missing txSignature");

        paidReceipts.add(txSignature);
        console.log(`[RECEIPT] Payment confirmed: ${txSignature.slice(0, 20)}...`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ confirmed: true, receipt: txSignature }));
      } catch (e: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── 404 fallback ────────────────────────────────────────────
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🚀 PolicyVault Demo API running on http://localhost:${PORT}`);
  console.log(`   GET  /data                 → 402 without payment, 200 with receipt`);
  console.log(`   POST /confirm-payment      → register tx signature as receipt\n`);
});