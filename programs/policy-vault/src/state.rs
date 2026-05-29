use anchor_lang::prelude::*;

// ─────────────────────────────────────────────
// VAULT
// The main account. One per owner.
// Seeds: ["vault", owner.key()]
// ─────────────────────────────────────────────
#[account]
pub struct Vault {
    pub owner: Pubkey,      // who controls this vault (32 bytes)
    pub is_paused: bool,    // emergency kill switch (1 byte)
    pub bump: u8,           // PDA bump saved for later use in CPIs (1 byte)
}

impl Vault {
    // 8 (anchor discriminator) + 32 + 1 + 1
    pub const LEN: usize = 8 + 32 + 1 + 1;
}

// ─────────────────────────────────────────────
// POLICY
// Spending limits. One per vault.
// Seeds: ["policy", vault.key()]
// ─────────────────────────────────────────────
#[account]
pub struct Policy {
    pub vault: Pubkey,             // which vault this policy belongs to (32)
    pub max_per_request: u64,      // max SOL (lamports) per single consume_budget call (8)
    pub period_cap: u64,           // max lamports allowed in one window (8)
    pub window_seconds: i64,       // how long the window is in seconds e.g. 3600 = 1 hour (8)
    pub spent_in_window: u64,      // how much has been spent in the current window (8)
    pub window_start: i64,         // unix timestamp when the current window started (8)
    pub bump: u8,                  // PDA bump (1)
}

impl Policy {
    // 8 + 32 + 8 + 8 + 8 + 8 + 8 + 1
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 8 + 1;
}

// ─────────────────────────────────────────────
// AGENT APPROVAL
// Authorization record for one agent wallet.
// Seeds: ["agent", vault.key(), agent.key()]
// ─────────────────────────────────────────────
#[account]
pub struct AgentApproval {
    pub vault: Pubkey,      // which vault (32)
    pub agent: Pubkey,      // which wallet is approved (32)
    pub is_active: bool,    // can be flipped false by revoke_agent (1)
    pub bump: u8,           // PDA bump (1)
}

impl AgentApproval {
    // 8 + 32 + 32 + 1 + 1
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1;
}

// ─────────────────────────────────────────────
// NONCE RECORD
// Replay protection. One per nonce used.
// Seeds: ["nonce", vault.key(), nonce: [u8;32]]
// Once created, its existence = "this nonce was used"
// ─────────────────────────────────────────────
#[account]
pub struct NonceRecord {
    pub vault: Pubkey,      // which vault (32)
    pub nonce: [u8; 32],    // the nonce itself stored for reference (32)
    pub bump: u8,           // PDA bump (1)
}

impl NonceRecord {
    // 8 + 32 + 32 + 1
    pub const LEN: usize = 8 + 32 + 32 + 1;
}

// ─────────────────────────────────────────────
// EVENTS
// Emitted on-chain for observability.
// Off-chain indexers and your demo can listen to these.
// ─────────────────────────────────────────────
#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct BudgetConsumed {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub remaining_in_window: u64,
}

#[event]
pub struct AgentRevoked {
    pub vault: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct VaultPaused {
    pub vault: Pubkey,
}