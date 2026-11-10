use std::{cell::RefCell, collections::HashMap, rc::Rc, sync::{mpsc, Arc}};

use gtk4::prelude::*;
use omni_core::image_backend::ImageBackend;
use serde_json::{json, Value};

use crate::{dispatch_on_main, publish_command_result};

pub fn handle(
    backend: &Arc<ImageBackend>,
    view: &webkit6::WebView,
    parent: Option<&gtk4::Window>,
    dialogs: &Rc<RefCell<HashMap<String, gtk4::FileChooserNative>>>,
    cmd: &str,
    request: Value,
    id: String,
) {
    if matches!(cmd, "image-select-model" | "image-export") {
        let export = cmd == "image-export";
        let bytes = export.then(|| backend.png()).flatten();
        let Some(parent) = parent.filter(|_| !export || bytes.is_some()) else {
            publish_command_result(view, &json!({"requestId":id,"ok":false}));
            return;
        };
        if dialogs.borrow().contains_key(&id) { return; }
        let title = request["title"].as_str();
        let accept = request["accept"].as_str();
        let cancel = request["cancel"].as_str();
        let dialog = gtk4::FileChooserNative::new(
            title, Some(parent),
            if export { gtk4::FileChooserAction::Save } else { gtk4::FileChooserAction::Open },
            accept, cancel,
        );
        let filter = gtk4::FileFilter::new();
        for pattern in if export { &["*.png"][..] } else { &["*.safetensors", "*.sft", "*.gguf"] } {
            filter.add_pattern(pattern);
        }
        dialog.add_filter(&filter);
        if export { dialog.set_current_name("omni-image.png"); }
        let view = view.clone();
        let key = id.clone();
        let registry = Rc::downgrade(dialogs);
        dialog.connect_response(move |dialog, response| {
            let payload = if response == gtk4::ResponseType::Accept {
                match dialog.file().and_then(|file| file.path()) {
                    Some(path) if export => {
                        let is_png = path.extension().and_then(|ext| ext.to_str())
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
                        let saved = is_png && bytes.as_deref().is_some_and(|png| ImageBackend::export_png(&path, png).is_ok());
                        json!({"requestId":id,"ok":saved})
                    }
                    Some(path) if path.is_file() && path.to_str().is_some() => {
                        json!({"requestId":id,"ok":true,"result":{"path":path.to_str()}})
                    }
                    _ => json!({"requestId":id,"ok":false}),
                }
            } else {
                json!({"requestId":id,"ok":true,"cancelled":true})
            };
            publish_command_result(&view, &payload);
            if let Some(registry) = registry.upgrade() { registry.borrow_mut().remove(&id); }
        });
        dialogs.borrow_mut().insert(key, dialog.clone());
        dialog.set_modal(true);
        dialog.show();
        return;
    }
    let backend = backend.clone();
    let cmd = cmd.to_owned();
    let view = view.clone();
    let (tx, rx) = mpsc::channel();
    dispatch_on_main(rx, move |result| publish_command_result(&view, &result));
    std::thread::spawn(move || {
        let outcome = match cmd.as_str() {
            "image-status" => Ok(backend.snapshot()),
            "image-save" => backend.save(&request["settings"]).map(|()| Value::Null),
            "image-install" => backend.install().map(|()| Value::Null),
            "image-generate" => backend.generate(&request),
            "image-cancel" => { backend.cancel(); Ok(Value::Null) }
            "image-stop" => { backend.stop(); Ok(Value::Null) }
            _ => Err("Unknown image command".into()),
        };
        let reply = match outcome {
            Ok(result) => json!({"requestId":id,"ok":true,"result":result}),
            Err(error) => {
                let detail: String = error.to_string().chars().rev().take(1600).collect::<Vec<_>>()
                    .into_iter().rev().collect();
                json!({"requestId":id,"ok":false,"error":{"message":detail}})
            }
        };
        let _ = tx.send(reply);
    });
}
