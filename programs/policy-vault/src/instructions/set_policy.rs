use anchor_lang::prelude::*;
use crate::state::{Vault, Policy};
use crate::errors::VaultError;

pub fn handler(
    ctx: Context<SetPolicy>,
    max_per_request: u64,
    period_cap: u64,
    window_seconds: i64,
) -> Result<()> {
    require!(max_per_request > 0, VaultError::ZeroAmount);
    require!(period_cap >= max_per_request, VaultError::ZeroAmount);
    require!(window_seconds > 0, VaultError::ZeroAmount);

    let clock = Clock::get()?;
    let policy = &mut ctx.accounts.policy;

    policy.vault           = ctx.accounts.vault.key();
    policy.max_per_request = max_per_request;
    policy.period_cap      = period_cap;
    policy.window_seconds  = window_seconds;
    policy.spent_in_window = 0;
    policy.window_start    = clock.unix_timestamp;
    policy.bump            = ctx.bumps.policy;

    msg!(
        "Policy set: max_per_req={} lamports, period_cap={} lamports, window={}s",
        max_per_request,
        period_cap,
        window_seconds
    );
    Ok(())
}

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = owner,
        space = Policy::LEN,
        seeds = [b"policy", vault.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, Policy>,

    pub system_program: Program<'info, System>,
}