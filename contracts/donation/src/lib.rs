#![no_std]

//! Donation contract: moves the donated token from donor to creator and
//! keeps a local, append-only log of donations. Creator profile state
//! (username, lifetime totals) lives in a separate `creator-registry`
//! contract — this contract talks to it exclusively through cross-contract
//! calls (`env.invoke_contract`), so the two contracts can be deployed,
//! upgraded, and audited independently.

use common::{CreatorProfile, DonationRecord};
use soroban_sdk::{
    contract, contractevent, contractimpl, symbol_short, token, Address, Env, IntoVal, Symbol,
    Val, Vec as SorobanVec, String,
};

const DONATIONS_KEY: Symbol = symbol_short!("donations");
const DONATION_COUNTER: Symbol = symbol_short!("counter");
const ADMIN_KEY: Symbol = symbol_short!("admin");
const REGISTRY_KEY: Symbol = symbol_short!("registry");

/// Emitted whenever a donation is settled on-chain. `donor` and `creator`
/// are indexed as topics so downstream systems (e.g. the backend's event
/// listener) can filter `getEvents` calls by either party without scanning
/// every ledger event.
#[contractevent(topics = ["donated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DonatedEvent {
    #[topic]
    pub donor: Address,
    #[topic]
    pub creator: Address,
    pub amount: i128,
    pub memo: String,
    pub timestamp: u64,
}

#[contract]
pub struct DonationContract;

#[contractimpl]
impl DonationContract {
    /// One-time setup: points this contract at the CreatorRegistry it will
    /// report donations to.
    pub fn initialize(env: Env, admin: Address, registry: Address) {
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&ADMIN_KEY),
            "donation contract already initialized"
        );
        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&REGISTRY_KEY, &registry);
    }

    /// Cross-contract call: delegates creator registration to the
    /// CreatorRegistry contract.
    pub fn register_creator(env: Env, creator: Address, username: String) -> CreatorProfile {
        let registry = Self::registry_address(&env);
        let args: SorobanVec<Val> = (creator, username).into_val(&env);
        env.invoke_contract(&registry, &Symbol::new(&env, "register_creator"), args)
    }

    /// Cross-contract call: reads a creator's profile from the
    /// CreatorRegistry contract.
    pub fn get_creator(env: Env, creator: Address) -> Option<CreatorProfile> {
        let registry = Self::registry_address(&env);
        let args: SorobanVec<Val> = (creator,).into_val(&env);
        env.invoke_contract(&registry, &Symbol::new(&env, "get_creator"), args)
    }

    /// Transfer `amount` of `token` from `donor` to `creator`, record the
    /// donation locally, and notify the CreatorRegistry (cross-contract) so
    /// the creator's lifetime stats stay in sync.
    pub fn donate(
        env: Env,
        donor: Address,
        creator: Address,
        token: Address,
        amount: i128,
        memo: String,
    ) -> DonationRecord {
        donor.require_auth();
        assert!(amount > 0, "Donation amount must be positive");

        // Move the funds from donor to creator via the token contract (e.g. native XLM SAC)
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&donor, &creator, &amount);

        // Cross-contract call: tell the registry to update the creator's
        // lifetime stats. The registry only accepts this call from the
        // donation contract address it was initialized with.
        let registry = Self::registry_address(&env);
        let record_args: SorobanVec<Val> =
            (env.current_contract_address(), creator.clone(), amount).into_val(&env);
        let (): () = env.invoke_contract(&registry, &Symbol::new(&env, "record_donation"), record_args);

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

        // Emit event (consumed by the backend's event listener for
        // real-time dashboard updates).
        DonatedEvent {
            donor,
            creator,
            amount,
            memo,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);

        donation
    }

    /// Get all donations count (approximate, stored in counter)
    pub fn get_total_donations_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DONATION_COUNTER)
            .unwrap_or(0)
    }

    /// Fetch a single donation record by its counter-based index.
    pub fn get_donation(env: Env, index: u32) -> Option<DonationRecord> {
        env.storage().persistent().get(&(DONATIONS_KEY, index))
    }

    fn registry_address(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&REGISTRY_KEY)
            .expect("donation contract not initialized: call initialize() first")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use creator_registry::{CreatorRegistryContract, CreatorRegistryContractClient};
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::StellarAssetClient;

    fn create_token_contract(env: &Env, admin: &Address) -> Address {
        env.register_stellar_asset_contract_v2(admin.clone())
            .address()
    }

    /// Deploys both contracts into the same test `Env` and wires them
    /// together, mirroring the real two-contract deployment.
    fn setup(env: &Env) -> (Address, DonationContractClient<'_>, CreatorRegistryContractClient<'_>) {
        let admin = Address::generate(env);
        let registry_id = env.register(CreatorRegistryContract, ());
        let donation_id = env.register(DonationContract, ());

        let registry_client = CreatorRegistryContractClient::new(env, &registry_id);
        let donation_client = DonationContractClient::new(env, &donation_id);

        registry_client.initialize(&admin, &donation_id);
        donation_client.initialize(&admin, &registry_id);

        (admin, donation_client, registry_client)
    }

    #[test]
    fn test_register_creator_via_registry() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        let (_admin, donation_client, _registry_client) = setup(&env);

        let creator = Address::generate(&env);
        env.ledger().with_mut(|li| li.sequence_number = 100);

        let profile = donation_client.register_creator(&creator, &String::from_bytes(&env, b"awesome_dev"));

        assert_eq!(profile.donation_count, 0);
        assert_eq!(profile.total_donations, 0);
    }

    #[test]
    fn test_donate_updates_registry_cross_contract() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        let (admin, donation_client, registry_client) = setup(&env);

        let donor = Address::generate(&env);
        let creator = Address::generate(&env);

        env.ledger().with_mut(|li| li.sequence_number = 100);

        let token_address = create_token_contract(&env, &admin);
        StellarAssetClient::new(&env, &token_address).mint(&donor, &10_000);

        donation_client.register_creator(&creator, &String::from_bytes(&env, b"awesome_dev"));

        let donation = donation_client.donate(
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

        // Verify the registry (a *separate* contract) picked up the stats
        // update via the cross-contract call made inside `donate`.
        let stats = registry_client.get_creator(&creator).unwrap();
        assert_eq!(stats.total_donations, 1000);
        assert_eq!(stats.donation_count, 1);

        // And the donation contract's own view of the registry agrees.
        let stats_via_donation = donation_client.get_creator(&creator).unwrap();
        assert_eq!(stats_via_donation.total_donations, 1000);
    }

    #[test]
    fn test_donate_without_prior_registration_creates_profile() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        let (admin, donation_client, registry_client) = setup(&env);

        let donor = Address::generate(&env);
        let creator = Address::generate(&env);

        let token_address = create_token_contract(&env, &admin);
        StellarAssetClient::new(&env, &token_address).mint(&donor, &5_000);

        donation_client.donate(
            &donor,
            &creator,
            &token_address,
            &250,
            &String::from_bytes(&env, b"First!"),
        );

        let stats = registry_client.get_creator(&creator).unwrap();
        assert_eq!(stats.total_donations, 250);
        assert_eq!(stats.donation_count, 1);
    }

    #[test]
    #[should_panic(expected = "Donation amount must be positive")]
    fn test_donate_rejects_non_positive_amount() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        let (admin, donation_client, _registry_client) = setup(&env);

        let donor = Address::generate(&env);
        let creator = Address::generate(&env);
        let token_address = create_token_contract(&env, &admin);
        StellarAssetClient::new(&env, &token_address).mint(&donor, &1_000);

        donation_client.donate(
            &donor,
            &creator,
            &token_address,
            &0,
            &String::from_bytes(&env, b"nope"),
        );
    }

    #[test]
    #[should_panic]
    fn test_donate_rejects_insufficient_balance() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        let (admin, donation_client, _registry_client) = setup(&env);

        let donor = Address::generate(&env);
        let creator = Address::generate(&env);
        let token_address = create_token_contract(&env, &admin);
        StellarAssetClient::new(&env, &token_address).mint(&donor, &10);

        donation_client.donate(
            &donor,
            &creator,
            &token_address,
            &1000,
            &String::from_bytes(&env, b"too much"),
        );
    }

    #[test]
    fn test_multiple_donations_increment_counter_and_history() {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();
        let (admin, donation_client, _registry_client) = setup(&env);

        let donor = Address::generate(&env);
        let creator = Address::generate(&env);
        let token_address = create_token_contract(&env, &admin);
        StellarAssetClient::new(&env, &token_address).mint(&donor, &10_000);

        donation_client.donate(&donor, &creator, &token_address, &100, &String::from_bytes(&env, b"one"));
        donation_client.donate(&donor, &creator, &token_address, &200, &String::from_bytes(&env, b"two"));

        assert_eq!(donation_client.get_total_donations_count(), 2);
        assert_eq!(donation_client.get_donation(&0).unwrap().amount, 100);
        assert_eq!(donation_client.get_donation(&1).unwrap().amount, 200);
    }
}
