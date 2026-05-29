use anchor_lang::prelude::*;
use crate::state::*;

pub fn handler(_ctx: Context<InitializeVault>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}