// 阻止 macOS 上 cmd+Q 行为和 Windows 上的一些默认菜单快捷键
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bswm_view_lib::run()
}
