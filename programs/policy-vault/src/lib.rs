// use anchor_lang::prelude::*;

// declare_id!("CF7R8RBEwGJtmDtxLkxsLJWWg8TdcQTiEVM34JtDxVLY");

// #[program]
// pub mod policy_vault {
//     use super::*;

//     pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
//         msg!("Greetings from: {:?}", ctx.program_id);
//         Ok(())
//     }
// }

// #[derive(Accounts)]
// pub struct Initialize {}


use anchor_lang::prelude::*;

pub mod errors;
pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("your_program_id_here"); // we'll fix this after first build

#[program]
pub mod policy_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn set_policy(
        ctx: Context<SetPolicy>,
        max_per_request: u64,
        period_cap: u64,
        window_seconds: i64,
    ) -> Result<()> {
        instructions::set_policy::handler(ctx, max_per_request, period_cap, window_seconds)
    }

    pub fn register_agent(ctx: Context<RegisterAgent>) -> Result<()> {
        instructions::register_agent::handler(ctx)
    }

    pub fn consume_budget(
        ctx: Context<ConsumeBudget>,
        amount: u64,
        nonce: [u8; 32],
    ) -> Result<()> {
        instructions::consume_budget::handler(ctx, amount, nonce)
    }

    pub fn revoke_agent(ctx: Context<RevokeAgent>) -> Result<()> {
        instructions::revoke_agent::handler(ctx)
    }

    pub fn pause_vault(ctx: Context<PauseVault>) -> Result<()> {
        instructions::pause_vault::handler(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }
}