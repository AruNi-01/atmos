use rand::seq::SliceRandom;
use rand::Rng;

/// List of Pokemon names for workspace naming
const POKEMON_NAMES: &[&str] = &[
    "bulbasaur",
    "ivysaur",
    "venusaur",
    "charmander",
    "charmeleon",
    "charizard",
    "squirtle",
    "wartortle",
    "blastoise",
    "caterpie",
    "metapod",
    "butterfree",
    "weedle",
    "kakuna",
    "beedrill",
    "pidgey",
    "pidgeotto",
    "pidgeot",
    "rattata",
    "raticate",
    "spearow",
    "fearow",
    "ekans",
    "arbok",
    "pikachu",
    "raichu",
    "sandshrew",
    "sandslash",
    "nidoran-f",
    "nidorina",
    "nidoqueen",
    "nidoran-m",
    "nidorino",
    "nidoking",
    "clefairy",
    "clefable",
    "vulpix",
    "ninetales",
    "jigglypuff",
    "wigglytuff",
    "zubat",
    "golbat",
    "oddish",
    "gloom",
    "vileplume",
    "paras",
    "parasect",
    "venonat",
    "venomoth",
    "diglett",
    "dugtrio",
    "meowth",
    "persian",
    "psyduck",
    "golduck",
    "mankey",
    "primeape",
    "growlithe",
    "arcanine",
    "poliwag",
    "poliwhirl",
    "poliwrath",
    "abra",
    "kadabra",
    "alakazam",
    "machop",
    "machoke",
    "machamp",
    "bellsprout",
    "weepinbell",
    "victreebel",
    "tentacool",
    "tentacruel",
    "geodude",
    "graveler",
    "golem",
    "ponyta",
    "rapidash",
    "slowpoke",
    "slowbro",
    "magnemite",
    "magneton",
    "farfetchd",
    "doduo",
    "dodrio",
    "seel",
    "dewgong",
    "grimer",
    "muk",
    "shellder",
    "cloyster",
    "gastly",
    "haunter",
    "gengar",
    "onix",
    "drowzee",
    "hypno",
    "krabby",
    "kingler",
    "voltorb",
    "electrode",
    "exeggcute",
    "exeggutor",
    "cubone",
    "marowak",
    "hitmonlee",
    "hitmonchan",
    "lickitung",
    "koffing",
    "weezing",
    "rhyhorn",
    "rhydon",
    "chansey",
    "tangela",
    "kangaskhan",
    "horsea",
    "seadra",
    "goldeen",
    "seaking",
    "staryu",
    "starmie",
    "mr-mime",
    "scyther",
    "jynx",
    "electabuzz",
    "magmar",
    "pinsir",
    "tauros",
    "magikarp",
    "gyarados",
    "lapras",
    "ditto",
    "eevee",
    "vaporeon",
    "jolteon",
    "flareon",
    "porygon",
    "omanyte",
    "omastar",
    "kabuto",
    "kabutops",
    "aerodactyl",
    "snorlax",
    "articuno",
    "zapdos",
    "moltres",
    "dratini",
    "dragonair",
    "dragonite",
    "mewtwo",
    "mew",
];

fn get_random_pokemon() -> &'static str {
    let mut rng = rand::thread_rng();
    POKEMON_NAMES[rng.gen_range(0..POKEMON_NAMES.len())]
}

fn generate_random_suffix(length: usize) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect()
}

/// Generate a unique workspace name using Pokemon names
///
/// Strategy:
/// 1. Try random Pokemon names with prefix (e.g., "atmos/pikachu")
/// 2. Try Pokemon names with version suffix (e.g., "atmos/pikachu-v2")
/// 3. Try combinations of two Pokemon names (e.g., "atmos/pikachu-charizard")
/// 4. Fallback to Pokemon name with random suffix (e.g., "atmos/pikachu-a3f9")
pub fn generate_workspace_name(existing_names: &[String], prefix: &str) -> String {
    let normalize = |name: &str| name.to_lowercase();
    let existing_set: std::collections::HashSet<String> =
        existing_names.iter().map(|n| normalize(n)).collect();

    let is_available = |name: &str| !existing_set.contains(&normalize(name));

    let mut rng = rand::thread_rng();

    // Strategy 1: Try shuffled Pokemon names
    let mut shuffled_pokemon: Vec<&str> = POKEMON_NAMES.to_vec();
    shuffled_pokemon.shuffle(&mut rng);

    for pokemon in &shuffled_pokemon {
        let candidate = format!("{}/{}", prefix, pokemon);
        if is_available(&candidate) {
            return candidate;
        }
    }

    // Strategy 2: Try Pokemon names with version suffix (v2-v9)
    for pokemon in &shuffled_pokemon {
        for v in 2..=9 {
            let candidate = format!("{}/{}-v{}", prefix, pokemon, v);
            if is_available(&candidate) {
                return candidate;
            }
        }
    }

    // Strategy 3: Try combinations of two different Pokemon names
    for _ in 0..50 {
        let pokemon1 = get_random_pokemon();
        let pokemon2 = get_random_pokemon();
        if pokemon1 != pokemon2 {
            let candidate = format!("{}/{}-{}", prefix, pokemon1, pokemon2);
            if is_available(&candidate) {
                return candidate;
            }
        }
    }

    // Strategy 4: Fallback - Pokemon name with random suffix
    let base_pokemon = get_random_pokemon();
    let suffix = generate_random_suffix(4);
    format!("{}/{}-{}", prefix, base_pokemon, suffix)
}

/// Extract repository prefix from project name
///
/// Examples:
/// - "owner/repo" -> "owner"
/// - "myproject" -> "myproject"
pub fn extract_repo_prefix(project_name: &str) -> String {
    if let Some(slash_pos) = project_name.find('/') {
        project_name[..slash_pos].to_string()
    } else {
        project_name.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_repo_prefix() {
        assert_eq!(extract_repo_prefix("owner/repo"), "owner");
        assert_eq!(extract_repo_prefix("myproject"), "myproject");
        assert_eq!(extract_repo_prefix("org/team/project"), "org");
    }

    #[test]
    fn test_generate_workspace_name_no_conflicts() {
        let existing: Vec<String> = vec![];
        let name = generate_workspace_name(&existing, "atmos");

        // Should start with prefix
        assert!(name.starts_with("atmos/"));

        // Should be one of the Pokemon names
        let pokemon_part = &name[6..]; // Skip "atmos/"
        let is_valid_pokemon = POKEMON_NAMES.contains(&pokemon_part);
        assert!(is_valid_pokemon, "Generated name: {}", name);
    }

    #[test]
    fn test_generate_workspace_name_with_conflicts() {
        // All Pokemon names taken
        let existing: Vec<String> = POKEMON_NAMES
            .iter()
            .map(|p| format!("atmos/{}", p))
            .collect();

        let name = generate_workspace_name(&existing, "atmos");

        // Should have a version suffix or other strategy
        assert!(name.starts_with("atmos/"));
        assert!(name.len() > 6); // Should have more than just "atmos/"
    }

    #[test]
    fn test_generate_unique_names() {
        let mut existing: Vec<String> = vec![];
        let mut generated_names = std::collections::HashSet::new();

        // Generate 10 unique names
        for _ in 0..10 {
            let name = generate_workspace_name(&existing, "test");
            assert!(
                !generated_names.contains(&name),
                "Duplicate name generated: {}",
                name
            );
            generated_names.insert(name.clone());
            existing.push(name);
        }
    }
}
