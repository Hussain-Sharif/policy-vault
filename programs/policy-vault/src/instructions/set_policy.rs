
use anchor_lang::prelude::*;
use crate::state::*;

pub fn handler(_ctx: Context<SetPolicy>, _max_per_request: u64, _period_cap: u64, _window_seconds: i64) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}