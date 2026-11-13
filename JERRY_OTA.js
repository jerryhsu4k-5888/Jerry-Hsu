// JERRY DATA CENTER OTA Launcher
// Install this script once in Scriptable as "JERRY DATA CENTER".
const BASE = "https://raw.githubusercontent.com/jerryhsu4k-5888/Jerry-Hsu/main/";
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "JerryDataCenterOTA");
if (!fm.fileExists(dir)) fm.createDirectory(dir);
const scriptPath = fm.joinPath(dir, "latest.js");
const metaPath = fm.joinPath(dir, "version.json");

async function fetchText(url) {
  const r = new Request(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now());
  r.timeoutInterval = 30;
  r.headers = {"Cache-Control":"no-cache", "Pragma":"no-cache"};
  return await r.loadString();
}
async function runOTA() {
  let code = null, status = "";
  try {
    const meta = JSON.parse(await fetchText(BASE + "version.json"));
    if (!meta.version || meta.script !== "latest.js") throw new Error("版本資訊格式錯誤");
    const fresh = await fetchText(BASE + meta.script);
    if (!fresh.includes("JERRY DATA CENTER v") || !fresh.trim().endsWith("await main();")) throw new Error("程式完整性檢查失敗");
    fm.writeString(scriptPath, fresh);
    fm.writeString(metaPath, JSON.stringify(meta));
    code = fresh;
    status = "已取得線上版本 v" + meta.version;
  } catch (e) {
    if (fm.fileExists(scriptPath)) {
      code = fm.readString(scriptPath);
      status = "離線模式：使用上次成功快取";
    } else {
      const a = new Alert(); a.title = "JERRY DATA CENTER OTA";
      a.message = "無法取得初始版本，且本機沒有快取。\n" + String(e);
      a.addAction("好"); await a.present(); Script.complete(); return;
    }
  }
  if (!code || !code.includes("await main();")) {
    const a = new Alert(); a.title = "OTA 驗證失敗";
    a.message = "本機程式不完整，已停止執行。";
    a.addAction("好"); await a.present(); Script.complete(); return;
  }
  if (!config.runsInWidget) {
    const a = new Alert(); a.title = "JERRY DATA CENTER OTA";
    a.message = status + "\n\n按「執行主程式」開始更新資料與預覽 Widget。";
    a.addAction("執行主程式"); a.addCancelAction("取消");
    if (await a.present() !== 0) { Script.complete(); return; }
  }
  await eval("(async function(){\n" + code + "\n})()");
}
await runOTA();
