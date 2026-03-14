use keyring::Entry;

use crate::models::AgentId;

fn keyring_entry(id: AgentId) -> std::result::Result<Entry, keyring::Error> {
    Entry::new("atmos-agent", id.as_str())
}

pub(crate) fn keyring_has_api_key(id: AgentId) -> std::result::Result<bool, keyring::Error> {
    let entry = keyring_entry(id)?;
    match entry.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e),
    }
}

pub(crate) fn keyring_get_api_key(id: AgentId) -> std::result::Result<String, keyring::Error> {
    let entry = keyring_entry(id)?;
    entry.get_password()
}

pub(crate) fn keyring_set_api_key(
    id: AgentId,
    api_key: &str,
) -> std::result::Result<(), keyring::Error> {
    let entry = keyring_entry(id)?;
    entry.set_password(api_key)
}
