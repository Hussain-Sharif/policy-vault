use anchor_lang::prelude::*;
use crate::state::{Vault, VaultInitialized};
use crate::errors::VaultError;

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.owner     = ctx.accounts.owner.key();
    vault.is_paused = false;
    vault.bump      = ctx.bumps.vault; // Anchor auto-computes and stores bump

    emit!(VaultInitialized {
        vault: vault.key(),
        owner: vault.owner,
    });

    msg!("PolicyVault initialized. Owner: {}", vault.owner);
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>, // pays for account creation, signs the tx

    #[account(
        init,                          // create this account (fails if already exists)
        payer = owner,                 // owner's wallet pays the rent
        space = Vault::LEN,            // how many bytes to allocate
        seeds = [b"vault", owner.key().as_ref()], // deterministic address
        bump                           // Anchor finds the canonical bump automatically
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>, // needed for account creation
}