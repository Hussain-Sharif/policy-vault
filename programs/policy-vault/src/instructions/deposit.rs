use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::Vault;
use crate::errors::VaultError;

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);

    // CPI = Cross Program Invocation
    // We're calling the System Program's transfer instruction
    // to move SOL from owner's wallet INTO the vault PDA
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to:   ctx.accounts.vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, amount)?;

    msg!("Deposited {} lamports into vault.", amount);
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized // owner field inside vault must match signer
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}