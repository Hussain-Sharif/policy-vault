use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Vault is paused. No spending allowed.")]
    VaultPaused,

    #[msg("Agent is not authorized for this vault.")]
    AgentNotAuthorized,

    #[msg("Agent has been revoked.")]
    AgentRevoked,

    #[msg("Amount exceeds max_per_request policy limit.")]
    ExceedsPerRequestLimit,

    #[msg("Amount would exceed the period spending cap.")]
    ExceedsPeriodCap,

    #[msg("This nonce has already been used. Replay attack detected.")]
    NonceAlreadyUsed,

    #[msg("Insufficient balance in vault.")]
    InsufficientBalance,

    #[msg("Only the vault owner can call this instruction.")]
    Unauthorized,

    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
}