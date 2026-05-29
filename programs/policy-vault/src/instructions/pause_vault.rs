// pause_vault.rs
use anchor_lang::prelude::*;
use crate::state::*;

pub fn handler(_ctx: Context<PauseVault>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct PauseVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}