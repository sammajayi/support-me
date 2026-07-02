#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol, String};

#[derive(Clone)]
#[contracttype]
pub struct DonationRecord {
    pub donor: Address,
    pub creator: Address,
    pub amount: i128,
    pub memo: String,
    pub timestamp: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct CreatorProfile {
    pub address: Address,
    pub username: String,
    pub total_donations: i128,
    pub donation_count: u32,
    pub created_at: u64,
}

const DONATIONS_KEY: Symbol = Symbol::short("donations");
const CREATORS_KEY: Symbol = Symbol::short("creators");
const DONATION_COUNTER: Symbol = Symbol::short("counter");

#[contract]
pub struct DonationContract;

#[contractimpl]
impl DonationContract {
    /// Register a new creator profile
    pub fn register_creator(env: Env, creator: Address, username: String) -> CreatorProfile {
        creator.require_auth();

        let profile = CreatorProfile {
            address: creator.clone(),
            username: username.clone(),
            total_donations: 0,
            donation_count: 0,
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&creator, &profile);

        env.events().publish(
            (Symbol::short("created"),),
            (creator.clone(), username),
        );

        profile
    }

    /// Get creator profile
    pub fn get_creator(env: Env, creator: Address) -> Option<CreatorProfile> {
        env.storage().persistent().get(&creator)
    }

    /// Record a donation and transfer the donated amount from donor to creator
    pub fn donate(
        env: Env,
        donor: Address,
        creator: Address,
        token: Address,
        amount: i128,
        memo: String,
    ) -> DonationRecord {
        donor.require_auth();

        // Validate inputs
        assert!(amount > 0, "Donation amount must be positive");

        // Move the funds from donor to creator via the token contract (e.g. native XLM SAC)
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&donor, &creator, &amount);

        // Get or create creator profile
        let mut creator_profile = env
            .storage()
            .persistent()
            .get::<_, CreatorProfile>(&creator)
            .unwrap_or_else(|| CreatorProfile {
                address: creator.clone(),
                username: String::from_bytes(&env, &[]),
                total_donations: 0,
                donation_count: 0,
                created_at: env.ledger().timestamp(),
            });

        // Update totals
        creator_profile.total_donations += amount;
        creator_profile.donation_count += 1;

        // Create donation record
        let donation = DonationRecord {
            donor: donor.clone(),
            creator: creator.clone(),
            amount,
            memo: memo.clone(),
            timestamp: env.ledger().timestamp(),
        };

        // Store donation record with counter-based key
        let counter: u32 = env
            .storage()
            .persistent()
            .get(&DONATION_COUNTER)
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&(DONATIONS_KEY, counter), &donation);
        env.storage()
            .persistent()
            .set(&DONATION_COUNTER, &(counter + 1));

        // Update creator profile
        env.storage()
            .persistent()
            .set(&creator, &creator_profile);

        // Emit event
        env.events().publish(
            (Symbol::short("donated"),),
            (
                donor.clone(),
                creator.clone(),
                amount,
                memo,
                env.ledger().timestamp(),
            ),
        );

        donation
    }

    /// Get creator's total donations
    pub fn get_creator_stats(env: Env, creator: Address) -> Option<CreatorProfile> {
        env.storage().persistent().get(&creator)
    }

    /// Get all donations count (approximate, stored in counter)
    pub fn get_total_donations_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DONATION_COUNTER)
            .unwrap_or(0)
    }

    /// Verify donor made a donation to creator
    pub fn verify_donation(
        env: Env,
        donor: Address,
        creator: Address,
        amount: i128,
    ) -> bool {
        // In a full implementation, you'd have a donations index
        // For now, this is a placeholder for verification logic
        donor.require_auth();

        if let Some(profile) = env.storage().persistent().get::<_, CreatorProfile>(&creator) {
            profile.total_donations >= amount && profile.donation_count > 0
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::StellarAssetClient;

    fn create_token_contract(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone())
            .address()
    }

    #[test]
    fn test_register_creator() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(DonationContract, ());
        let client = DonationContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        env.ledger().with_mut(|li| li.sequence_number = 100);

        let profile = client.register_creator(&creator, &String::from_bytes(&env, b"awesome_dev"));

        assert_eq!(profile.donation_count, 0);
        assert_eq!(profile.total_donations, 0);
    }

    #[test]
    fn test_donate() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(DonationContract, ());
        let client = DonationContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        let creator = Address::generate(&env);

        env.ledger().with_mut(|li| li.sequence_number = 100);

        let token_address = create_token_contract(&env, &admin);
        StellarAssetClient::new(&env, &token_address).mint(&donor, &10_000);

        // Register creator first
        client.register_creator(&creator, &String::from_bytes(&env, b"awesome_dev"));

        // Make donation
        let donation = client.donate(
            &donor,
            &creator,
            &token_address,
            &1000,
            &String::from_bytes(&env, b"Great work!"),
        );

        assert_eq!(donation.amount, 1000);
        assert_eq!(donation.donor, donor);
        assert_eq!(donation.creator, creator);

        // Verify the transfer actually happened
        let token_client = token::Client::new(&env, &token_address);
        assert_eq!(token_client.balance(&creator), 1000);
        assert_eq!(token_client.balance(&donor), 9_000);

        // Verify creator stats
        let stats = client.get_creator_stats(&creator).unwrap();
        assert_eq!(stats.total_donations, 1000);
        assert_eq!(stats.donation_count, 1);
    }
}
