use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    os::unix::fs::OpenOptionsExt,
    path::Path,
};

pub fn read(path: &Path) -> io::Result<Value> {
    match fs::read(path) {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes)?;
            if !value.is_object() {
                return Err(io::Error::new(io::ErrorKind::InvalidData, "Expected a settings object"));
            }
            Ok(value)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}

// Commands run in order on the GTK main thread. The small preference file
// is replaced only after the complete new document has been written.
pub fn write(path: &Path, value: &Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(value)?;
    if !value.is_object() || bytes.len() > 16 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid UI settings"));
    }
    fs::create_dir_all(path.parent().ok_or(io::ErrorKind::InvalidInput)?)?;
    let temp = path.with_extension("tmp");
    let mut file = OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(&temp)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    fs::rename(temp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn replace_preferences_and_preserve_previous_file_on_failed_write() {
        let directory = std::env::temp_dir().join(format!(
            "omni-ui-settings-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let path = directory.join("ui-settings.json");
        assert!(read(&path).unwrap().is_null());
        write(&path, &json!({"theme": "nord"})).unwrap();
        fs::create_dir(path.with_extension("tmp")).unwrap();
        assert!(write(&path, &json!({"theme": "light"})).is_err());
        assert_eq!(read(&path).unwrap()["theme"], "nord");
        fs::remove_dir(path.with_extension("tmp")).unwrap();
        write(&path, &json!({"theme": "light"})).unwrap();
        assert_eq!(read(&path).unwrap()["theme"], "light");
        fs::remove_dir_all(directory).unwrap();
    }
}
