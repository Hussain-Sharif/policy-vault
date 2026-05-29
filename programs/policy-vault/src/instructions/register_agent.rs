use anchor_lang::prelude::*;
use crate::state::{Vault, AgentApproval};
use crate::errors::VaultError;

pub fn handler(ctx: Context<RegisterAgent>) -> Result<()> {
    let approval = &mut ctx.accounts.agent_approval;

    approval.vault     = ctx.accounts.vault.key();
    approval.agent     = ctx.accounts.agent.key();
    approval.is_active = true;
    approval.bump      = ctx.bumps.agent_approval;

    msg!("Agent registered: {}", ctx.accounts.agent.key());
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: this is just a pubkey being approved, no signing required
    pub agent: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = AgentApproval::LEN,
        seeds = [b"agent", vault.key().as_ref(), agent.key().as_ref()],
        bump
    )]
    pub agent_approval: Account<'info, AgentApproval>,

    pub system_program: Program<'info, System>,
}