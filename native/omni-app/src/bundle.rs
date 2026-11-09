use std::path::{Path, PathBuf};

use omni_core::{engine, paths, settings::Settings};

pub const MODEL: &str = "LFM3-Omni-2B-Q4_K_M.gguf";
pub const PROJECTOR: &str = "mmproj-LFM3-Omni-2B-Q4_K_M.gguf";
pub const MODEL_SHA256: &str = "9f8d30e9d4fd7a9349d586e077988229b3ca0a0e4ad730897563d1eccc9893e2";
pub const PROJECTOR_SHA256: &str = "0a746c0794782a16d4456b230c2a0b5888a2d94a6677211edbed7d7a4177a39a";
const PREFIX: &str = "@bundled/";

pub struct Bundle(PathBuf);

impl Bundle {
    pub fn discover(site: &Path) -> Option<Self> {
        let root = site.parent()?.join("resources").join("omni-complete");
        root.is_dir().then_some(Self(root))
    }

    pub fn model_ref() -> String {
        format!("{PREFIX}{MODEL}")
    }

    pub fn projector_ref() -> String {
        format!("{PREFIX}{PROJECTOR}")
    }

    pub fn runtime(&self) -> PathBuf {
        self.0.join(paths::backend_archive_name())
    }

    pub fn seed_new_profile(&self) -> std::io::Result<()> {
        if paths::config_file().try_exists()?
            || paths::config_dir().join("ui-settings.json").try_exists()?
            || paths::data_dir().join("history").try_exists()?
            || paths::backend_root_dir().try_exists()?
        {
            return Ok(());
        }
        let mut settings = Settings::default();
        settings.integrated_enabled = true;
        settings.model_gguf = Some(Self::model_ref());
        settings.model_mmproj = Some(Self::projector_ref());
        settings.integrated_params.model = settings.model_gguf.clone();
        settings.integrated_params.mmproj = settings.model_mmproj.clone();
        settings.integrated_params.ngl = "0".into();
        settings.integrated_params.ctx_size = 4096;
        settings.integrated_params.cache_type_k = "f16".into();
        settings.integrated_params.cache_type_v = "f16".into();
        settings.save()
    }
}

pub fn model_path(bundle: Option<&Bundle>, reference: &str, verify: bool) -> Result<PathBuf, String> {
    let Some(name) = reference.strip_prefix(PREFIX) else {
        return Ok(PathBuf::from(reference));
    };
    let sha = match name {
        MODEL => MODEL_SHA256,
        PROJECTOR => PROJECTOR_SHA256,
        _ => return Err(format!("Unknown bundled component: {name}")),
    };
    let path = bundle.ok_or_else(|| format!("Missing bundled component: {name}"))?.0.join(name);
    if verify {
        engine::verify_sha256(&path, sha).map_err(|error| format!("{name}: {error}"))?;
    }
    Ok(path)
}
