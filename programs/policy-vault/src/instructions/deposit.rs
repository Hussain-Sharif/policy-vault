// deposit.rs
use anchor_lang::prelude::*;
use crate::state::*;

pub fn handler(_ctx: Context<Deposit>, _amount: u64) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}