use anchor_lang::prelude::*;

declare_id!("CF7R8RBEwGJtmDtxLkxsLJWWg8TdcQTiEVM34JtDxVLY");

#[program]
pub mod policy_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
