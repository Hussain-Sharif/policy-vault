// withdraw.rs
use anchor_lang::prelude::*;
use crate::state::Vault;
use crate::errors::VaultError;

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);

    let vault_balance = ctx.accounts.vault.to_account_info().lamports();
    require!(vault_balance >= amount, VaultError::InsufficientBalance);

    // Transfer lamports out of vault PDA to owner
    **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()?  += amount;

    msg!("Withdrew {} lamports from vault to owner.", amount);
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
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