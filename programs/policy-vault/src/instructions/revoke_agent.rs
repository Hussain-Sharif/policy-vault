
use anchor_lang::prelude::*;
use crate::state::{Vault, AgentApproval, AgentRevoked};
use crate::errors::VaultError;

pub fn handler(ctx: Context<RevokeAgent>) -> Result<()> {
    ctx.accounts.agent_approval.is_active = false;

    emit!(AgentRevoked {
        vault: ctx.accounts.vault.key(),
        agent: ctx.accounts.agent_approval.agent,
    });

    msg!("Agent revoked: {}", ctx.accounts.agent_approval.agent);
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"agent", vault.key().as_ref(), agent_approval.agent.as_ref()],
        bump = agent_approval.bump
    )]
    pub agent_approval: Account<'info, AgentApproval>,

    pub system_program: Program<'info, System>,
}