//! Extração segura de arquivos `.tar.gz` (defesa contra path traversal).

use std::io::Read;
use std::path::{Component, Path, PathBuf};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExtractError {
    #[error("erro de I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("entrada inválida no arquivo: {0}")]
    Invalid(String),
}

fn safe_join(base: &Path, entry: &Path) -> Result<PathBuf, ExtractError> {
    if entry.is_absolute() {
        return Err(ExtractError::Invalid(format!(
            "caminho absoluto na entrada: {}",
            entry.display()
        )));
    }
    let mut out = base.to_path_buf();
    for comp in entry.components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            Component::ParentDir => {
                return Err(ExtractError::Invalid(format!(
                    "caminho com '..' na entrada: {}",
                    entry.display()
                )))
            }
            other => {
                return Err(ExtractError::Invalid(format!(
                    "componente não permitido {other:?} na entrada: {}",
                    entry.display()
                )))
            }
        }
    }
    Ok(out)
}

/// Extrai um `.tar.gz` para `dest`, recusando entradas fora do destino.
pub fn extract_tar_gz(archive: &Path, dest: &Path) -> Result<(), ExtractError> {
    std::fs::create_dir_all(dest)?;
    let gz = flate2::read::GzDecoder::new(std::fs::File::open(archive)?);
    let mut tar = tar::Archive::new(gz);
    for entry in tar.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.to_path_buf();
        let target = safe_join(dest, &path)?;
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if entry.header().entry_type().is_symlink() {
            let link = entry
                .link_name()?
                .map(|p| p.into_owned())
                .ok_or_else(|| ExtractError::Invalid("symlink sem alvo".into()))?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(&link, &target)?;
            continue;
        }
        let mut f = std::fs::File::create(&target)?;
        std::io::copy(&mut entry, &mut f)?;
        drop(f);
        // Preserva as permissões do pacote (ex.: executável llama-server).
        let mode = entry.header().mode().unwrap_or(0o644);
        if mode != 0 {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&target, std::fs::Permissions::from_mode(mode))?;
        }
    }
    Ok(())
}

/// Lê bytes de um arquivo (para testes de integridade).
pub fn file_bytes(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    std::fs::File::open(path)?.read_to_end(&mut buf)?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_tar(entries: &[(&str, &[u8])]) -> tempfile::NamedTempFile {
        let f = tempfile::NamedTempFile::new().unwrap();
        {
            let gz = flate2::write::GzEncoder::new(
                std::fs::File::create(f.path()).unwrap(),
                flate2::Compression::default(),
            );
            let mut tar = tar::Builder::new(gz);
            for (name, data) in entries {
                let mut header = tar::Header::new_gnu();
                header.set_size(data.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();
                tar.append_data(&mut header, *name, &data[..]).unwrap();
            }
            tar.finish().unwrap();
        }
        f
    }

    #[test]
    fn extrai_arquivos_validos() {
        let tar = make_tar(&[("a.txt", b"ola"), ("sub/b.txt", b"mundo")]);
        let dest = tempfile::tempdir().unwrap();
        extract_tar_gz(tar.path(), dest.path()).unwrap();
        assert_eq!(file_bytes(&dest.path().join("a.txt")).unwrap(), b"ola");
        assert_eq!(
            file_bytes(&dest.path().join("sub/b.txt")).unwrap(),
            b"mundo"
        );
    }

    #[test]
    fn rejeita_path_traversal() {
        let base = Path::new("/tmp/omni_dest");
        assert!(safe_join(base, Path::new("../evil.txt")).is_err());
        assert!(safe_join(base, Path::new("a/../../evil.txt")).is_err());
        assert_eq!(
            safe_join(base, Path::new("sub/ok.txt")).unwrap(),
            PathBuf::from("/tmp/omni_dest/sub/ok.txt")
        );
    }

    #[test]
    fn rejeita_caminho_absoluto() {
        let base = Path::new("/tmp/omni_dest");
        assert!(safe_join(base, Path::new("/tmp/evil.txt")).is_err());
    }
}
