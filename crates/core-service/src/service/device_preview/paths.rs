use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct DevicePreviewPaths {
    pub serve_sim_runtime: PathBuf,
    pub serve_emu_runtime: PathBuf,
    pub serve_sim_cache: PathBuf,
    pub serve_emu_cache: PathBuf,
    pub state_dir: PathBuf,
}

impl DevicePreviewPaths {
    pub fn production() -> Result<Self, String> {
        Ok(Self {
            serve_sim_runtime: runtime_manager::serve_sim_runtime_dir()?,
            serve_emu_runtime: runtime_manager::serve_emu_runtime_dir()?,
            serve_sim_cache: runtime_manager::serve_sim_cache_dir()?,
            serve_emu_cache: runtime_manager::serve_emu_cache_dir()?,
            state_dir: runtime_manager::simulator_state_dir()?,
        })
    }

    pub fn isolated(root: &Path) -> Self {
        Self {
            serve_sim_runtime: root.join("runtime/serve-sim"),
            serve_emu_runtime: root.join("runtime/serve-emu"),
            serve_sim_cache: root.join("cache/serve-sim"),
            serve_emu_cache: root.join("cache/serve-emu"),
            state_dir: root.join("state/simulator"),
        }
    }
}
