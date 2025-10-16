use anchor_lang::prelude::*;

declare_id!("5xjPsgMHuoj4MrAPJVBrTomk5UAZvCxVtAdcWwgheoZs");

#[program]
pub mod example {
    use super::*;

    pub fn pubkey_seed_ix(ctx: Context<PubkeySeedIx>, input: u64) -> Result<()> {
        msg!("Input: {}", input);
        msg!("bump seed: {}", ctx.bumps.new_account);
        msg!("signer: {}", ctx.accounts.signer.key());
        ctx.accounts.new_account.input = input;
        ctx.accounts.new_account.bump = ctx.bumps.new_account;
        Ok(())
    }

    pub fn update_optional_input(ctx: Context<UpdateOptionalInput>, input: u64, optional_input: Option<Pubkey>) -> Result<()> {
        ctx.accounts.existing_account.input = input;
        msg!("Input: {}", input);
        ctx.accounts.existing_account.optional_input = optional_input;
        msg!("Optional Input: {:?}", optional_input);
        Ok(())
    }
    pub fn update_optional_account(ctx: Context<UpdateOptionalAccount>, _id: u64) -> Result<()> {
        ctx.accounts.created_optional_acc.optional_acc = ctx.accounts.optional_acc_key.as_ref().map(|acc| acc.key());
        Ok(())
    }
    pub fn no_arguments(ctx: Context<NoArguments>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct PubkeySeedIx<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init, 
        payer = signer, 
        space = 8 + 8 + 1 + 32 + 1,
        seeds = [b"seed", signer.key().as_ref()], 
        bump
    )]
    pub new_account: Account<'info, DataAccount1>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct DataAccount1 {
    input: u64,
    optional_input: Option<Pubkey>,
    bump: u8,
}

#[derive(Accounts)]
pub struct UpdateOptionalInput<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"seed", signer.key().as_ref()], 
        bump = existing_account.bump
    )]
    pub existing_account: Account<'info, DataAccount1>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct UpdateOptionalAccount<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        seeds = [b"optional_acc".as_ref(), &id.to_le_bytes()], 
        payer = signer,
        space = 8 + 1 + 32,
        bump,
    )]
    pub created_optional_acc: Account<'info, StoreOptionalAccount>,
    pub optional_acc_key: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct NoArguments<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        payer = signer,
        space = 8 + 1 + 32,
    )]
    pub acc: Account<'info, StoreOptionalAccount>,
    pub system_program: Program<'info, System>,
}


#[account]
pub struct StoreOptionalAccount {
    optional_acc: Option<Pubkey>,
}


// #[derive(Accounts)]
// #[instruction(input: [u8; 8], id: u64)]
// pub struct OptionalAccount<'info> {
//     #[account(mut)]
//     pub signer: Signer<'info>,
//     #[account(
//         init,
//         seeds = [b"optional_acc", input.as_ref(), &id.to_le_bytes()], 
//         payer = signer,
//         space = ResetAccount::INIT_SPACE,
//         bump,
//     )]
//     pub reset_acc: Account<'info, ResetAccount>,
//     pub optional_acc: Option<UncheckedAccount<'info>>,
//     pub system_program: Program<'info, System>,
// }