use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{Vault, Policy, AgentApproval, NonceRecord, BudgetConsumed};
use crate::errors::VaultError;

pub fn handler(ctx: Context<ConsumeBudget>, amount: u64, nonce: [u8; 32]) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);

    // ── Check 1: Vault must not be paused ──────────────────────────────
    require!(!ctx.accounts.vault.is_paused, VaultError::VaultPaused);

    // ── Check 2: Agent must be active ─────────────────────────────────
    require!(
        ctx.accounts.agent_approval.is_active,
        VaultError::AgentRevoked
    );

    // ── Check 3: Amount within per-request limit ───────────────────────
    let policy = &mut ctx.accounts.policy;
    require!(
        amount <= policy.max_per_request,
        VaultError::ExceedsPerRequestLimit
    );

    // ── Check 4: Reset window if expired, then check period cap ────────
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    if now >= policy.window_start + policy.window_seconds {
        // Window expired — reset counter
        policy.spent_in_window = 0;
        policy.window_start    = now;
    }

    require!(
        policy.spent_in_window.checked_add(amount).unwrap() <= policy.period_cap,
        VaultError::ExceedsPeriodCap
    );

    // ── Check 5: Vault has enough balance ─────────────────────────────
    let vault_balance = ctx.accounts.vault.to_account_info().lamports();
    require!(vault_balance >= amount, VaultError::InsufficientBalance);

    // ── Transfer SOL from vault PDA to payee ──────────────────────────
    // PDA cannot sign normally — we use lamport manipulation directly
    // This is the canonical way to move SOL OUT of a PDA
    **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.payee.to_account_info().try_borrow_mut_lamports()? += amount;

    // ── Update spent tracker ──────────────────────────────────────────
    policy.spent_in_window += amount;

    // ── Mark nonce as used (replay protection) ────────────────────────
    // The NonceRecord PDA being CREATED = nonce is now consumed
    // If someone tries same nonce again, `init` will FAIL because account exists
    let nonce_record = &mut ctx.accounts.nonce_record;
    nonce_record.vault = ctx.accounts.vault.key();
    nonce_record.nonce = nonce;
    nonce_record.bump  = ctx.bumps.nonce_record;

    // ── Emit event ───────────────────────────────────────────────────
    let remaining = policy.period_cap - policy.spent_in_window;
    emit!(BudgetConsumed {
        vault:                ctx.accounts.vault.key(),
        agent:                ctx.accounts.agent.key(),
        payee:                ctx.accounts.payee.key(),
        amount,
        remaining_in_window:  remaining,
    });

    msg!(
        "Budget consumed: {} lamports → {}. Remaining in window: {}",
        amount,
        ctx.accounts.payee.key(),
        remaining
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: [u8; 32])]
pub struct ConsumeBudget<'info> {
    #[account(mut)]
    pub agent: Signer<'info>, // agent wallet signs this transaction

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"policy", vault.key().as_ref()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        seeds = [b"agent", vault.key().as_ref(), agent.key().as_ref()],
        bump = agent_approval.bump
    )]
    pub agent_approval: Account<'info, AgentApproval>,

    #[account(
        init,                          // REPLAY PROTECTION: if this PDA exists = nonce used
        payer = agent,
        space = NonceRecord::LEN,
        seeds = [b"nonce", vault.key().as_ref(), nonce.as_ref()],
        bump
    )]
    pub nonce_record: Account<'info, NonceRecord>,

    /// CHECK: payee is the API provider receiving payment, no constraint needed
    #[account(mut)]
    pub payee: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}