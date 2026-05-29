// consume_budget.rs
use anchor_lang::prelude::*;
use crate::state::*;

pub fn handler(_ctx: Context<ConsumeBudget>, _amount: u64, _nonce: [u8; 32]) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct ConsumeBudget<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,
    pub system_program: Program<'info, System>,
}