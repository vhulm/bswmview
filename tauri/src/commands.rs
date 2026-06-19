use serde::Serialize;
use std::path::Path;
use tauri::command;

/// 文件内容返回结构
#[derive(Serialize)]
pub struct FileContent {
    pub name: String,
    pub content: String,
    pub path: String,
}

/// 打开原生文件选择对话框，读取 .arxml 文件
///
/// 这是 Vue 无法原生实现的功能：浏览器 <input type="file"> 无法设置对话框标题、
/// 无法控制窗口位置，且在 Windows 上体验不如原生对话框。
/// Tauri 仅负责"选择文件并读取内容"这一原生交互，所有后续解析逻辑都在 Vue 中完成。
#[command]
pub async fn open_file(app: tauri::AppHandle) -> Result<Option<FileContent>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .add_filter("ARXML 文件", &["arxml", "xml"])
        .add_filter("所有文件", &["*"])
        .set_title("选择 ARXML 文件")
        .blocking_pick_file();

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            let name = Path::new(&path_str)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let content = std::fs::read_to_string(&path_str)
                .map_err(|e| format!("读取文件失败: {}", e))?;

            Ok(Some(FileContent {
                name,
                content,
                path: path_str,
            }))
        }
        None => Ok(None),
    }
}

/// 根据文件路径重新读取文件内容（无需对话框）
#[command]
pub async fn read_file(file_path: String) -> Result<FileContent, String> {
    let name = Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    Ok(FileContent {
        name,
        content,
        path: file_path,
    })
}
