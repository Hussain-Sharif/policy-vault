// pause_vault.rs
use anchor_lang::prelude::*;
use crate::state::{Vault, VaultPaused};
use crate::errors::VaultError;

pub fn handler(ctx: Context<PauseVault>) -> Result<()> {
    ctx.accounts.vault.is_paused = true;

    emit!(VaultPaused {
        vault: ctx.accounts.vault.key(),
    });

    msg!("Vault paused: {}", ctx.accounts.vault.key());
    Ok(())
}

#[derive(Accounts)]
pub struct PauseVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}