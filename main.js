import { BrowserWindow as e, Menu as t, app as n, dialog as r, ipcMain as i } from "electron";
import { basename as a, dirname as o, join as s } from "node:path";
import { readFile as c } from "node:fs/promises";
import { fileURLToPath as l } from "node:url";
//#region electron/main.ts
var u = o(l(import.meta.url)), d = !n.isPackaged, f = null;
function p() {
	f = new e({
		width: 1280,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		title: "AUTOSAR BswM 可视化工具",
		autoHideMenuBar: !0,
		webPreferences: {
			preload: s(u, "preload.js"),
			nodeIntegration: !1,
			contextIsolation: !0
		}
	}), t.setApplicationMenu(null), d ? (f.loadURL("http://localhost:5173"), f.webContents.openDevTools()) : f.loadFile(s(u, "../web/index.html")), f.on("closed", () => {
		f = null;
	});
}
i.handle("dialog:openFile", async () => {
	if (!f) return null;
	let e = await r.showOpenDialog(f, {
		title: "选择 ARXML 文件",
		filters: [{
			name: "ARXML 文件",
			extensions: ["arxml", "xml"]
		}, {
			name: "所有文件",
			extensions: ["*"]
		}],
		properties: ["openFile"]
	});
	if (e.canceled || e.filePaths.length === 0) return null;
	let t = e.filePaths[0], n = a(t);
	try {
		return {
			name: n,
			content: await c(t, "utf-8")
		};
	} catch (e) {
		return console.error("读取文件失败:", e), null;
	}
}), i.handle("demo:loadFile", async () => {
	try {
		let e = d ? s(u, "../../public/BswM.arxml") : s(u, "../web/BswM.arxml");
		console.log("[demo:loadFile] isDev:", d, "__dirname:", u, "filePath:", e);
		let t = await c(e, "utf-8");
		return console.log("[demo:loadFile] read OK, length:", t.length), {
			name: "BswM.arxml",
			content: t
		};
	} catch (e) {
		return console.error("[demo:loadFile] FAILED:", e), null;
	}
}), n.whenReady().then(() => {
	p(), n.on("activate", () => {
		e.getAllWindows().length === 0 && p();
	});
}), n.on("window-all-closed", () => {
	process.platform !== "darwin" && n.quit();
});
//#endregion
export {};
