// revoke_agent.rs
use anchor_lang::prelude::*;
use crate::state::*;

pub fn handler(_ctx: Context<RevokeAgent>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}