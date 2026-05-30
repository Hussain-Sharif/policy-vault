use anchor_lang::prelude::*;
use crate::state::Vault;
use crate::errors::VaultError;

pub fn handler(ctx: Context<ResumeVault>) -> Result<()> {
    ctx.accounts.vault.is_paused = false;
    msg!("Vault resumed: {}", ctx.accounts.vault.key());
    Ok(())
}

#[derive(Accounts)]
pub struct ResumeVault<'info> {
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