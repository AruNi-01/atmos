//! Installed-only create catalogs. Parse host stdout; callers spawn the tools.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IosDeviceType {
    pub identifier: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IosRuntime {
    pub identifier: String,
    pub name: String,
    pub supported_device_types: Vec<IosDeviceType>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AndroidProfile {
    pub id: String,
    pub name: String,
    pub oem: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AndroidImage {
    /// Full `system-images;…` package path for `avdmanager --package`.
    pub package: String,
    pub api_level: String,
    pub tag: String,
    pub abi: String,
}

/// Parse `xcrun simctl list runtimes --json`.
///
/// Keeps `isAvailable == true` and iOS only (`platform` / `identifier` contains
/// `iOS`, drop watchOS/tvOS).
pub fn parse_simctl_runtimes(json_text: &str) -> Vec<IosRuntime> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json_text) else {
        return Vec::new();
    };
    let Some(runtimes) = value.get("runtimes").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for runtime in runtimes {
        let available = runtime
            .get("isAvailable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !available {
            continue;
        }
        let identifier = runtime
            .get("identifier")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let platform = runtime
            .get("platform")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if !runtime_text_is_ios(platform, identifier) {
            continue;
        }
        let Some(name) = runtime.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        if identifier.is_empty() {
            continue;
        }
        let supported_device_types = runtime
            .get("supportedDeviceTypes")
            .and_then(|v| v.as_array())
            .map(|types| {
                types
                    .iter()
                    .filter_map(|item| {
                        let identifier = item.get("identifier").and_then(|v| v.as_str())?;
                        let name = item.get("name").and_then(|v| v.as_str())?;
                        if identifier.is_empty() || name.is_empty() {
                            return None;
                        }
                        Some(IosDeviceType {
                            identifier: identifier.to_string(),
                            name: name.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        out.push(IosRuntime {
            identifier: identifier.to_string(),
            name: name.to_string(),
            supported_device_types,
        });
    }
    out
}

fn runtime_text_is_ios(platform: &str, identifier: &str) -> bool {
    let blob = [platform, identifier].join(" ");
    blob.contains("iOS") && !blob.contains("watchOS") && !blob.contains("tvOS")
}

/// Parse `avdmanager list device` after `Available devices definitions:`.
///
/// Split on `---` blocks. `id: <n> or "<id>"` → profile id is the quoted string.
/// Skip blocks with no id.
pub fn parse_avd_device_list(text: &str) -> Vec<AndroidProfile> {
    let Some(start) = text.find("Available devices definitions:") else {
        return Vec::new();
    };
    let body = &text[start + "Available devices definitions:".len()..];
    let mut profiles = Vec::new();
    let mut current = String::new();
    for line in body.lines() {
        if is_block_separator(line) {
            push_avd_profile(&current, &mut profiles);
            current.clear();
        } else {
            if !current.is_empty() {
                current.push('\n');
            }
            current.push_str(line);
        }
    }
    push_avd_profile(&current, &mut profiles);
    profiles
}

fn push_avd_profile(block: &str, profiles: &mut Vec<AndroidProfile>) {
    let block = block.trim();
    if block.is_empty() {
        return;
    }
    let Some(id) = parse_quoted_device_id(block) else {
        return;
    };
    profiles.push(AndroidProfile {
        id,
        name: field_after_label(block, "Name").unwrap_or_default(),
        oem: field_after_label(block, "OEM"),
        tag: field_after_label(block, "Tag"),
    });
}

fn is_block_separator(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.len() >= 3 && trimmed.chars().all(|c| c == '-')
}

fn parse_quoted_device_id(block: &str) -> Option<String> {
    let line = block.lines().next()?.trim();
    let rest = line.strip_prefix("id:")?.trim_start();
    let or_at = rest.find(" or ")?;
    let quoted = rest[or_at + 4..].trim();
    let inner = quoted.strip_prefix('"')?.strip_suffix('"')?;
    if inner.is_empty() {
        return None;
    }
    Some(inner.to_string())
}

fn field_after_label(block: &str, label: &str) -> Option<String> {
    for line in block.lines() {
        let line = line.trim();
        let Some(after) = line.strip_prefix(label) else {
            continue;
        };
        let after = after.trim_start();
        let Some(value) = after.strip_prefix(':') else {
            continue;
        };
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        return Some(value.to_string());
    }
    None
}

/// Parse `sdkmanager --list_installed`. Keep `system-images;` rows.
///
/// Split path on `;` → `{package, apiLevel, tag, abi}`.
pub fn parse_sdk_installed_system_images(text: &str) -> Vec<AndroidImage> {
    let mut images = Vec::new();
    for line in text.lines() {
        let path = line
            .split('|')
            .next()
            .map(str::trim)
            .unwrap_or("")
            .trim_start_matches(|c: char| c == '*' || c.is_whitespace());
        if !path.starts_with("system-images;") {
            continue;
        }
        let mut parts = path.split(';');
        let Some(_) = parts.next() else {
            continue;
        };
        let Some(api_level) = parts.next() else {
            continue;
        };
        let Some(tag) = parts.next() else {
            continue;
        };
        let Some(abi) = parts.next() else {
            continue;
        };
        if api_level.is_empty() || tag.is_empty() || abi.is_empty() {
            continue;
        }
        images.push(AndroidImage {
            package: path.to_string(),
            api_level: api_level.to_string(),
            tag: tag.to_string(),
            abi: abi.to_string(),
        });
    }
    images
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_available_ios_runtimes_and_drops_watch_tv() {
        let json = r#"{
          "runtimes": [
            {
              "identifier": "com.apple.CoreSimulator.SimRuntime.iOS-18-0",
              "platform": "iOS",
              "isAvailable": true,
              "name": "iOS 18.0",
              "supportedDeviceTypes": [
                {
                  "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
                  "name": "iPhone 16"
                },
                { "name": "missing identifier" },
                { "identifier": "com.apple.CoreSimulator.SimDeviceType.iPad-missing-name" }
              ]
            },
            {
              "identifier": "com.apple.CoreSimulator.SimRuntime.iOS-17-0",
              "platform": "iOS",
              "isAvailable": false,
              "name": "iOS 17.0",
              "supportedDeviceTypes": [
                {
                  "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-15",
                  "name": "iPhone 15"
                }
              ]
            },
            {
              "identifier": "com.apple.CoreSimulator.SimRuntime.watchOS-11-0",
              "platform": "watchOS",
              "isAvailable": true,
              "name": "watchOS 11.0",
              "supportedDeviceTypes": [
                {
                  "identifier": "com.apple.CoreSimulator.SimDeviceType.Apple-Watch",
                  "name": "Apple Watch"
                }
              ]
            },
            {
              "identifier": "com.apple.CoreSimulator.SimRuntime.tvOS-18-0",
              "platform": "tvOS",
              "isAvailable": true,
              "name": "tvOS 18.0",
              "supportedDeviceTypes": []
            }
          ]
        }"#;
        let runtimes = parse_simctl_runtimes(json);
        assert_eq!(runtimes.len(), 1);
        assert_eq!(
            runtimes[0].identifier,
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0"
        );
        assert_eq!(
            runtimes[0]
                .supported_device_types
                .iter()
                .map(|t| t.identifier.as_str())
                .collect::<Vec<_>>(),
            ["com.apple.CoreSimulator.SimDeviceType.iPhone-16"]
        );
        assert_eq!(runtimes[0].supported_device_types[0].name, "iPhone 16");
    }

    #[test]
    fn parses_avd_profile_quoted_id_and_skips_blocks_without_id() {
        let text = r#"Loading local repository...
[=========                              ] 25% Loading local repository...
Available devices definitions:
id: 0 or "tv_1080p"
    Name: Android TV (1080p)
    OEM : Google
    Tag : android-tv
---------
id: 1 or "pixel_6"
    Name: Pixel 6
    OEM : Google
---------
    Name: Broken device
    OEM : Nobody
---------
id: 2 or "small_phone"
    Name: Small Phone
    OEM : Generic
    Tag : default
"#;
        let profiles = parse_avd_device_list(text);
        assert_eq!(
            profiles.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
            ["tv_1080p", "pixel_6", "small_phone"]
        );
        assert_eq!(profiles[1].name, "Pixel 6");
        assert_eq!(profiles[1].oem.as_deref(), Some("Google"));
        assert_eq!(profiles[0].tag.as_deref(), Some("android-tv"));
        assert_eq!(profiles[1].tag, None);
    }

    #[test]
    fn parses_installed_system_images_only() {
        let text = r#"Installed packages:
  Path                                                 | Version | Description                       | Location
  -------                                              | ------- | -------                           | -------
  build-tools;34.0.0                                   | 34.0.0  | Android SDK Build-Tools 34        | build-tools/34.0.0
  emulator                                             | 35.2.10 | Android Emulator                  | emulator
  platforms;android-34                                 | 2       | Android SDK Platform 34           | platforms/android-34
  system-images;android-34;google_apis;arm64-v8a       | 12      | Google APIs ARM 64 v8a System Image | system-images/android-34/google_apis/arm64-v8a
  system-images;android-34;google_apis_playstore;arm64-v8a | 12 | Google Play ARM 64 v8a System Image | system-images/android-34/google_apis_playstore/arm64-v8a
  system-images;android-33;google_apis                 | 9       | incomplete row                    | skipped
"#;
        let images = parse_sdk_installed_system_images(text);
        assert_eq!(
            images
                .iter()
                .map(|i| i.package.as_str())
                .collect::<Vec<_>>(),
            [
                "system-images;android-34;google_apis;arm64-v8a",
                "system-images;android-34;google_apis_playstore;arm64-v8a"
            ]
        );
        assert_eq!(images[0].api_level, "android-34");
        assert_eq!(images[0].tag, "google_apis");
        assert_eq!(images[0].abi, "arm64-v8a");
        assert_eq!(images[1].tag, "google_apis_playstore");
    }
}
