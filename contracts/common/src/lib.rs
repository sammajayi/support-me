#![no_std]

//! Shared data types for the SupportMe contracts. Kept in their own crate so
//! that `donation` and `creator-registry` agree on a single, canonical
//! definition and can exchange values across contract calls.

use soroban_sdk::{contracttype, Address, String};

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
