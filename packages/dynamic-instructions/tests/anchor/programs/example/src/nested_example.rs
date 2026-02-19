
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StructAndEnumsInput {
	pub header: InnerHeader,
	pub inner_struct: InnerStruct,
	pub inner_enum: InnerEnum,
    pub seed_enum: SeedEnum,
    pub pubkey: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InnerHeader {
	pub version: u32,
	pub command: Command,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InnerStruct {
	pub value: u64,
	pub name: String,
    pub seed_enum: SeedEnum,
    pub bytes: Vec<u8>,
    pub optional_pubkey: Option<Pubkey>,
    pub enums_array: [SeedEnum; 2],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Command {
	Start,
	Stop,
	Continue { reason: String },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum InnerEnum {
	TokenTransfer { amount: u64, token_type: TokenType },
	Stake { duration: u64 },
	None,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum SeedEnum {
	Arm = 0,
	Bar = 1,
	Car = 2,
}

impl SeedEnum {
    pub fn as_seed(&self) -> [u8; 1] {
        [self.clone() as u8]
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum TokenType {
	SPL,
	NFT { collection: String },
}

#[derive(Accounts)]
#[instruction(input: StructAndEnumsInput)]
pub struct NestedStructsAndEnums<'info> {
	#[account(mut)]
	pub signer: Signer<'info>,
    // The PDA account is derived using multiple fields from the input arguments, demonstrating complex seed derivation.
    // Dependency from argument doesn't produce pdaAccountNode with seeds in Codama IDL.
	#[account(
		init,
        payer = signer,
        space = 8 + AccountExample::INIT_SPACE,
		seeds = [
			b"pda_account",
			input.pubkey.as_ref(),
			input.seed_enum.as_seed().as_ref(),
			input.inner_struct.seed_enum.as_seed().as_ref(),
            // pda_account1.address.as_ref(),
		],
		bump
	)]
	pub pda_account: Account<'info, AccountExample>,
    // #[account(
	// 	mut,
	// 	// init,
    //     // payer = signer,
    //     // space = 8 + AccountExample::INIT_SPACE,
	// 	seeds = [
	// 		b"pda_account1",
	// 		signer.key().as_ref(),
	// 	],
	// 	bump
	// )]
	// pub pda_account1: Account<'info, AccountExample>,
    pub system_program: Program<'info, System>,
}

/// Helper to extract a seed from InnerEnum for PDA derivation.
pub fn inner_enum_seed(inner_enum: &InnerEnum) -> [u8; 8] {
    match inner_enum {
        InnerEnum::TokenTransfer { amount, .. } => amount.to_le_bytes(),
        InnerEnum::Stake { duration } => duration.to_le_bytes(),
        InnerEnum::None => 0u64.to_le_bytes(),
    }
}

#[account]
#[derive(InitSpace)]
pub struct AccountExample {
    pub inner: Inner,
    pub address: Pubkey,
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone)]
#[derive(InitSpace)]
pub struct Inner {
	pub seed: u64,
}

pub fn handler(
	_ctx: Context<NestedStructsAndEnums>,
	input: StructAndEnumsInput,
) -> Result<()> {
	msg!("Version: {}", input.header.version);
	match input.header.command {
		Command::Start => msg!("Command: Start"),
		Command::Stop => msg!("Command: Stop"),
		Command::Continue { reason } => msg!("Command: Continue, reason: {}", reason),
	}
	msg!("InnerStruct value: {}", input.inner_struct.value);
	msg!("InnerStruct name: {}", input.inner_struct.name);
	match input.inner_enum {
		InnerEnum::TokenTransfer { amount, token_type } => {
			msg!("InnerEnum::TokenTransfer: amount {}", amount);
			match token_type {
				TokenType::SPL => msg!("TokenType: SPL"),
				TokenType::NFT { collection } => msg!("TokenType: NFT, collection: {}", collection),
			}
		}
		InnerEnum::Stake { duration } => {
			msg!("InnerEnum::Stake: duration {}", duration);
		}
		InnerEnum::None => msg!("InnerEnum: None"),
	}
	Ok(())
}
