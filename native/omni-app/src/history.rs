use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const CHUNK: usize = 128 * 1024;
const RETENTION_MS: u64 = 30 * 24 * 60 * 60 * 1000;

#[derive(Clone)]
pub struct History {
    root: PathBuf,
    lock: Arc<Mutex<()>>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "Invalid history request")
}

fn identifier(value: &Value) -> io::Result<&str> {
    value.as_str().filter(|s| s.len() == 36 &&
        s.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')).ok_or_else(invalid)
}

fn read_json(path: &Path) -> io::Result<Value> {
    serde_json::from_slice(&fs::read(path)?).map_err(io::Error::other)
}

fn write_json(path: &Path, value: &Value) -> io::Result<()> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec(value).map_err(io::Error::other)?)?;
    fs::rename(temp, path)
}

impl History {
    pub fn new() -> Self {
        Self { root: omni_core::paths::data_dir().join("history"), lock: Arc::new(Mutex::new(())) }
    }

    pub fn execute(&self, cmd: &str, request: &Value) -> io::Result<Value> {
        let _guard = self.lock.lock().map_err(|_| io::Error::other("History lock poisoned"))?;
        self.handle(cmd, request)
    }

    fn summary(chat: &Value) -> Value {
        let title = chat["customTitle"].as_str().or_else(|| chat["title"].as_str());
        json!({ "id": chat["id"], "title": title, "pinned": chat["pinned"], "updatedAt": chat["updatedAt"] })
    }

    fn expire(dir: &Path, timestamp: u64) -> io::Result<()> {
        let file = dir.join("conversation.json");
        let mut chat = read_json(&file)?;
        let mut changed = false;
        if let Some(messages) = chat["messages"].as_array_mut() {
            for message in messages {
                if let Some(media) = message["media"].as_array_mut() {
                    for asset in media {
                        if Self::expire_asset(dir, asset, timestamp)? { changed = true; }
                    }
                }
                if let Some(asset) = message.get_mut("speech") {
                    if Self::expire_asset(dir, asset, timestamp)? { changed = true; }
                }
            }
        }
        if changed { write_json(&file, &chat)?; }
        Ok(())
    }

    fn expire_asset(dir: &Path, asset: &mut Value, timestamp: u64) -> io::Result<bool> {
        if asset["expired"] == true || !asset["expiresAt"].as_u64().is_some_and(|end| end <= timestamp) {
            return Ok(false);
        }
        if let Ok(id) = identifier(&asset["assetId"]) {
            match fs::remove_file(dir.join(format!("{id}.media"))) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
        }
        asset["expired"] = json!(true);
        Ok(true)
    }

    fn clean_abandoned_media(dir: &Path, timestamp: u64) -> io::Result<()> {
        const DAY_MS: u64 = 24 * 60 * 60 * 1000;
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() { continue; }
            let path = entry.path();
            let age_limit = match path.extension().and_then(|ext| ext.to_str()) {
                Some("media") => RETENTION_MS + DAY_MS,
                Some("part") => DAY_MS,
                _ => continue,
            };
            let id = json!(path.file_stem().and_then(|stem| stem.to_str()));
            if identifier(&id).is_err() { continue; }
            let modified = entry.metadata()?.modified()?;
            if modified.duration_since(UNIX_EPOCH).is_ok_and(|age| {
                timestamp.saturating_sub(age.as_millis() as u64) >= age_limit
            }) {
                fs::remove_file(path)?;
            }
        }
        Ok(())
    }

    fn handle(&self, cmd: &str, req: &Value) -> io::Result<Value> {
        let mut root = fs::DirBuilder::new();
        root.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            root.mode(0o700);
        }
        root.create(&self.root)?;
        if cmd == "history-list" {
            let mut rows = Vec::new();
            let timestamp = now();
            for entry in fs::read_dir(&self.root)?.flatten() {
                let path = entry.path();
                if !entry.file_type()?.is_dir() { continue; }
                let name = entry.file_name().to_string_lossy().into_owned();
                if identifier(&json!(name)).is_err() { continue; }
                if let Err(error) = Self::expire(&path, timestamp) {
                    if error.kind() != io::ErrorKind::NotFound { log::warn!("History expiration: {error}"); }
                }
                if let Err(error) = Self::clean_abandoned_media(&path, timestamp) {
                    log::warn!("History media cleanup: {error}");
                }
                if let Ok(chat) = read_json(&path.join("conversation.json")) {
                    rows.push(Self::summary(&chat));
                }
            }
            rows.sort_by(|a, b| (b["pinned"].as_bool(), b["updatedAt"].as_u64())
                .cmp(&(a["pinned"].as_bool(), a["updatedAt"].as_u64())));
            let active = read_json(&self.root.join("active.json")).unwrap_or(Value::Null);
            return Ok(json!({ "rows": rows, "active": active }));
        }
        if cmd == "history-active" {
            if !req["id"].is_null() { identifier(&req["id"])?; }
            write_json(&self.root.join("active.json"), &req["id"])?;
            return Ok(Value::Null);
        }

        let id = identifier(&req["id"])?;
        let dir = self.root.join(id);
        let file = dir.join("conversation.json");
        match cmd {
            "history-get" => {
                Self::expire(&dir, now())?;
                read_json(&file)
            }
            "history-save" => {
                let messages = req["messages"].as_array().ok_or_else(invalid)?;
                if messages.is_empty() { return Ok(Value::Null); }
                fs::create_dir_all(&dir)?;
                let existing = match read_json(&file) {
                    Ok(chat) => chat,
                    Err(error) if error.kind() == io::ErrorKind::NotFound => json!({ "pinned": false }),
                    Err(error) => return Err(error),
                };
                let title = messages.iter().filter(|message| message["role"] == "user")
                    .filter_map(|message| message["text"].as_str().map(str::trim))
                    .find(|text| !text.is_empty())
                    .map(|text| text.chars().take(160).collect::<String>());
                let chat = json!({
                    "id": id, "title": title, "customTitle": existing["customTitle"],
                    "pinned": existing["pinned"], "updatedAt": now(), "messages": messages,
                });
                write_json(&file, &chat)?;
                Ok(Self::summary(&chat))
            }
            "history-rename" | "history-pin" => {
                let mut chat = read_json(&file)?;
                if cmd == "history-rename" {
                    let title = req["title"].as_str().map(str::trim).filter(|s| !s.is_empty()).ok_or_else(invalid)?;
                    chat["customTitle"] = json!(title.chars().take(160).collect::<String>());
                } else {
                    chat["pinned"] = json!(req["pinned"].as_bool().ok_or_else(invalid)?);
                }
                write_json(&file, &chat)?;
                Ok(Self::summary(&chat))
            }
            "history-delete" => {
                fs::remove_dir_all(&dir)?;
                let active = self.root.join("active.json");
                if read_json(&active).ok().as_ref() == Some(&json!(id)) {
                    if let Err(error) = write_json(&active, &Value::Null) {
                        log::warn!("History active pointer cleanup: {error}");
                    }
                }
                Ok(Value::Null)
            }
            "history-media-write" | "history-media-read" => {
                let asset = identifier(&req["assetId"])?;
                let destination = dir.join(format!("{asset}.media"));
                let offset = req["offset"].as_u64().ok_or_else(invalid)?;
                if cmd == "history-media-read" {
                    let mut media = fs::File::open(destination)?;
                    let metadata = media.metadata()?;
                    if metadata.modified()?.elapsed().unwrap_or_default().as_millis() >= RETENTION_MS as u128 {
                        return Err(io::Error::new(io::ErrorKind::NotFound, "Expired media"));
                    }
                    media.seek(SeekFrom::Start(offset))?;
                    let mut bytes = vec![0; CHUNK];
                    let len = media.read(&mut bytes)?;
                    return Ok(json!({ "data": STANDARD.encode(&bytes[..len]), "count": len, "eof": offset + len as u64 >= metadata.len() }));
                }
                let data = req["data"].as_str().filter(|s| s.len() <= 4 * CHUNK / 3 + 4).ok_or_else(invalid)?;
                let bytes = STANDARD.decode(data).map_err(io::Error::other)?;
                fs::create_dir_all(&dir)?;
                let partial = dir.join(format!("{asset}.part"));
                let mut handle = OpenOptions::new().create(true).append(true).open(&partial)?;
                if handle.metadata()?.len() != offset { return Err(invalid()); }
                handle.write_all(&bytes)?;
                if req["last"] == true {
                    handle.sync_all()?;
                    drop(handle);
                    fs::rename(partial, destination)?;
                    return Ok(json!({ "expiresAt": now().saturating_add(RETENTION_MS) }));
                }
                Ok(Value::Null)
            }
            _ => Err(invalid()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIRST: &str = "11111111-1111-1111-1111-111111111111";
    const SECOND: &str = "22222222-2222-2222-2222-222222222222";
    const MEDIA: &str = "33333333-3333-3333-3333-333333333333";

    struct TestFolder(PathBuf);
    impl Drop for TestFolder {
        fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
    }

    fn fixture() -> (TestFolder, History) {
        let root = std::env::temp_dir().join(format!(
            "omni-history-test-{}-{}", std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        (TestFolder(root.clone()), History { root, lock: Arc::new(Mutex::new(())) })
    }

    #[test]
    fn titles_pin_and_active_survive_reopen_and_delete_removes_the_conversation() {
        let (_folder, history) = fixture();
        for (id, title) in [(FIRST, "  First prompt  "), (SECOND, "Second prompt")] {
            let result = history.execute("history-save", &json!({
                "id": id, "messages": [
                    { "role": "assistant", "text": "Generated text" },
                    { "role": "user", "text": title },
                ]
            })).unwrap();
            assert_eq!(result["title"], title.trim());
        }
        history.execute("history-rename", &json!({ "id": FIRST, "title": "Renamed" })).unwrap();
        history.execute("history-pin", &json!({ "id": FIRST, "pinned": true })).unwrap();
        history.execute("history-active", &json!({ "id": FIRST })).unwrap();
        let reopened = History { root: history.root.clone(), lock: Arc::new(Mutex::new(())) };
        let listing = reopened.execute("history-list", &json!({})).unwrap();
        assert_eq!(listing["rows"][0]["id"], FIRST);
        assert_eq!(listing["rows"][0]["title"], "Renamed");
        assert_eq!(listing["active"], FIRST);
        reopened.execute("history-delete", &json!({ "id": FIRST })).unwrap();
        assert!(!history.root.join(FIRST).exists());
        assert_eq!(reopened.execute("history-list", &json!({})).unwrap()["active"], Value::Null);
    }

    #[test]
    fn media_is_committed_atomically_and_expires_without_losing_document_text() {
        let (_folder, history) = fixture();
        let first = json!({ "id": FIRST, "assetId": MEDIA, "offset": 0, "data": STANDARD.encode(b"ab"), "last": false });
        history.execute("history-media-write", &first).unwrap();
        assert!(!history.root.join(FIRST).join(format!("{MEDIA}.media")).exists());
        let result = history.execute("history-media-write", &json!({
            "id": FIRST, "assetId": MEDIA, "offset": 2, "data": STANDARD.encode(b"cd"), "last": true,
        })).unwrap();
        let expires = result["expiresAt"].as_u64().unwrap();
        history.execute("history-save", &json!({
            "id": FIRST, "messages": [{ "role": "user", "text": "Preserve the text", "media": [{
                "kind": "document", "assetId": MEDIA, "expiresAt": expires, "documentText": "Document contents",
            }]}]
        })).unwrap();
        let result = history.execute("history-media-read", &json!({ "id": FIRST, "assetId": MEDIA, "offset": 0 })).unwrap();
        assert_eq!(STANDARD.decode(result["data"].as_str().unwrap()).unwrap(), b"abcd");
        History::expire(&history.root.join(FIRST), expires).unwrap();
        assert!(!history.root.join(FIRST).join(format!("{MEDIA}.media")).exists());
        let chat = history.execute("history-get", &json!({ "id": FIRST })).unwrap();
        assert_eq!(chat["messages"][0]["text"], "Preserve the text");
        assert_eq!(chat["messages"][0]["media"][0]["documentText"], "Document contents");
        assert_eq!(chat["messages"][0]["media"][0]["expired"], true);
    }
}
