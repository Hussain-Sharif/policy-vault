"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const web3_js_1 = require("@solana/web3.js");
const PORT = Number(process.env.PORT || 3000);
const PRICE_SOL = Number(process.env.PRICE_SOL || 0.005);
const PRICE_LAM = Math.floor(PRICE_SOL * 1000000000);
const PROGRAM_ID = process.env.PROGRAM_ID || "CF7R8RBEwGJtmDtxLkxsLJWWg8TdcQTiEVM34JtDxVLY";
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const programPubkey = new web3_js_1.PublicKey(PROGRAM_ID);
const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
const receipts = new Map();
function setCORS(res) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function json(res, status, data, extraHeaders = {}) {
    res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
    res.end(JSON.stringify(data));
}
const server = http_1.default.createServer((req, res) => {
    setCORS(res);
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }
    const url = new URL(req.url, `http://localhost:${PORT}`);
    // GET /data
    if (req.method === "GET" && url.pathname === "/data") {
        const receipt = url.searchParams.get("receipt");
        if (!receipt) {
            json(res, 402, {
                error: "Payment Required",
                code: 402,
                price: `${PRICE_LAM} lamports (${PRICE_SOL} SOL)`,
                instruction: "Call PolicyVault.consume_budget, then POST /confirm-payment with txSignature",
            }, {
                "X-Payment-Required": "true",
                "X-Payment-Amount": PRICE_LAM.toString(),
                "X-Payment-Currency": "SOL (lamports)",
                "X-Payment-Description": "PolicyVault consume_budget call required",
                "X-Payment-Network": "Solana Devnet",
                "X-Payment-Recipient": PROGRAM_ID,
            });
            console.log(`[402] No payment. Required: ${PRICE_LAM} lamports`);
            return;
        }
        const ctx = receipts.get(receipt);
        if (!ctx) {
            json(res, 402, { error: "Receipt not found or not yet confirmed" });
            return;
        }
        json(res, 200, {
            success: true,
            data: {
                price_feed: "SOL/USD: $185.42",
                block_height: 345291847,
                tps: 52000,
                message: "Premium data unlocked via PolicyVault x402 payment.",
                receipt,
                vault: ctx.vaultPda,
                payee: ctx.payee,
                amount: ctx.amount,
            },
        });
        console.log(`[200] Data served. Receipt: ${receipt.slice(0, 20)}...`);
        return;
    }
    // POST /confirm-payment
    if (req.method === "POST" && url.pathname === "/confirm-payment") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
            try {
                const { txSignature, vaultPda, owner, agent, payee, expectedLamports } = JSON.parse(body);
                if (!txSignature || !vaultPda || !owner || !payee || !expectedLamports) {
                    json(res, 400, { error: "Missing required fields: txSignature, vaultPda, owner, payee, expectedLamports" });
                    return;
                }
                console.log(`[VERIFY] Checking tx on Solana: ${txSignature.slice(0, 30)}...`);
                const txInfo = await connection.getTransaction(txSignature, {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0,
                });
                if (!txInfo) {
                    console.log("[REJECT] Transaction not found on-chain");
                    json(res, 402, { error: "Transaction not found on-chain" });
                    return;
                }
                if (txInfo.meta?.err) {
                    console.log("[REJECT] Transaction failed on-chain");
                    json(res, 402, { error: "Transaction failed on-chain", detail: txInfo.meta.err });
                    return;
                }
                const staticKeys = txInfo.transaction.message.getAccountKeys().staticAccountKeys;
                // Verify transaction called PolicyVault program
                const calledVault = staticKeys.some((k) => k.equals(programPubkey));
                if (!calledVault) {
                    console.log("[REJECT] Tx did not call PolicyVault program");
                    json(res, 402, { error: "Transaction did not call PolicyVault" });
                    return;
                }
                // Verify expected accounts are in the transaction
                const vaultKey = new web3_js_1.PublicKey(vaultPda);
                const payeeKey = new web3_js_1.PublicKey(payee);
                const vaultIdx = staticKeys.findIndex((k) => k.equals(vaultKey));
                const payeeIdx = staticKeys.findIndex((k) => k.equals(payeeKey));
                if (vaultIdx === -1) {
                    console.log("[REJECT] Vault PDA not found in transaction accounts");
                    json(res, 402, { error: "Vault PDA not found in transaction" });
                    return;
                }
                if (payeeIdx === -1) {
                    console.log("[REJECT] Payee not found in transaction accounts");
                    json(res, 402, { error: "Payee not found in transaction" });
                    return;
                }
                // Verify lamport flow: vault lost >= expectedLamports
                const vaultPre = txInfo.meta.preBalances[vaultIdx];
                const vaultPost = txInfo.meta.postBalances[vaultIdx];
                const vaultDelta = vaultPre - vaultPost;
                if (vaultDelta < expectedLamports) {
                    console.log(`[REJECT] Vault lamport mismatch: expected >=${expectedLamports} got ${vaultDelta}`);
                    json(res, 402, { error: "Vault lamport amount does not match expected payment" });
                    return;
                }
                // Verify payee gained at least expectedLamports
                const payeePre = txInfo.meta.preBalances[payeeIdx];
                const payeePost = txInfo.meta.postBalances[payeeIdx];
                const payeeDelta = payeePost - payeePre;
                if (payeeDelta < expectedLamports) {
                    console.log(`[REJECT] Payee lamport mismatch: expected >=${expectedLamports} got ${payeeDelta}`);
                    json(res, 402, { error: "Payee lamport amount does not match expected payment" });
                    return;
                }
                // All checks passed — store receipt with context
                receipts.set(txSignature, { vaultPda, owner, agent, payee, amount: expectedLamports });
                console.log(`[VERIFIED] On-chain confirmed. PolicyVault called. Receipt stored.`);
                console.log(`  vault=${vaultPda.slice(0, 16)}... payee=${payee.slice(0, 16)}... amount=${expectedLamports}`);
                json(res, 200, { confirmed: true, receipt: txSignature, message: "Payment verified on Solana" });
            }
            catch (e) {
                console.log(`[ERROR] ${e.message}`);
                json(res, 400, { error: e.message });
            }
        });
        return;
    }
    // GET /status
    if (req.method === "GET" && url.pathname === "/status") {
        json(res, 200, {
            server: "PolicyVault x402 API",
            status: "running",
            rpc: RPC_URL,
            program: PROGRAM_ID,
            price_lamports: PRICE_LAM,
            receipts_count: receipts.size,
        });
        return;
    }
    json(res, 404, { error: "Not found" });
});
server.listen(PORT, () => {
    console.log(`\nPolicyVault x402 API live on port ${PORT}`);
    console.log(`   Program : ${PROGRAM_ID}`);
    console.log(`   RPC     : ${RPC_URL}\n`);
});
