use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

static TEMPLATE_VAR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\$\{([A-Za-z0-9_]+)\}").expect("valid template regex"));

pub fn render_prompt_template(template: &str, values: &[(&str, &str)]) -> String {
    let values = values.iter().copied().collect::<HashMap<_, _>>();

    TEMPLATE_VAR_RE
        .replace_all(template, |captures: &regex::Captures<'_>| {
            captures
                .get(1)
                .and_then(|name| values.get(name.as_str()).copied())
                .unwrap_or("")
                .to_string()
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::render_prompt_template;

    #[test]
    fn replaces_known_variables() {
        let rendered = render_prompt_template(
            "Hello ${name}, welcome to ${place}.",
            &[("name", "Codex"), ("place", "atmos")],
        );

        assert_eq!(rendered, "Hello Codex, welcome to atmos.");
    }

    #[test]
    fn drops_unknown_variables() {
        let rendered = render_prompt_template("Hello ${name}${suffix}", &[("name", "Codex")]);

        assert_eq!(rendered, "Hello Codex");
    }
}
