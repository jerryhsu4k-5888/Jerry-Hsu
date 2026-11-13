// JERRY DATA CENTER v1.4.1 — Forecast + multi-feed earthquakes + source health
// Compatible with Scriptable ListWidget APIs; rightAlignContent intentionally not used
// Weather + Taiwan earthquakes + Air Quality
// Save as: JERRY DATA CENTER
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "JerryDataCenter");
if (!fm.fileExists(dir)) fm.createDirectory(dir);
const cfgFile = fm.joinPath(dir, "config.json");
const cacheFile = fm.joinPath(dir, "cache.json");
const defaults = { placeName:"", latitude:null, longitude:null, cwaApiKey:"", refreshMinutes:30, widgetSize:"large" };
let cfg = Object.assign({}, defaults, readJSON(cfgFile, {}));
let cache = readJSON(cacheFile, {});

function readJSON(p, fallback) { try { return fm.fileExists(p) ? JSON.parse(fm.readString(p)) : fallback; } catch(e) { return fallback; } }
function saveJSON(p, x) { fm.writeString(p, JSON.stringify(x, null, 2)); }
function n(v, d=0) { const x=Number(v); return Number.isFinite(x) ? x.toFixed(d) : "—"; }
function fmt(iso) {
  if (!iso) return "時間未提供";
  const d = new Date(iso); if (isNaN(d)) return String(iso);
  const f = new DateFormatter(); f.locale="zh_TW"; f.timeZone="Asia/Taipei"; f.dateFormat="MM/dd HH:mm"; return f.string(d);
}
async function getJSON(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = new Request(url);
      r.timeoutInterval = 28;
      r.headers = {"Accept":"application/json","User-Agent":"JerryDataCenter/1.1"};
      const data = await r.loadJSON();
      if (data && data.error) throw new Error(data.reason || "API 回傳 error");
      return data;
    } catch (e) {
      lastError = e;
      // Retry once immediately; avoids depending on background timer APIs. 
    }
  }
  throw new Error(String(lastError));
}
async function configure() {
  const a = new Alert(); a.title="設定 JERRY DATA CENTER";
  a.message="輸入自訂觀測地點座標。CWA API Key 可稍後補上；天氣與空品不需要 Key。";
  a.addTextField("地點名稱，例如：台北市", cfg.placeName);
  a.addTextField("緯度，例如：25.0330", cfg.latitude==null?"":String(cfg.latitude));
  a.addTextField("經度，例如：121.5654", cfg.longitude==null?"":String(cfg.longitude));
  a.addSecureTextField("中央氣象署 API Key（選填）", cfg.cwaApiKey);
  a.addAction("儲存"); a.addCancelAction("取消");
  if (await a.present() !== 0) return false;
  const lat=Number(a.textFieldValue(1)), lon=Number(a.textFieldValue(2)), name=a.textFieldValue(0).trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) {
    const e=new Alert(); e.title="座標無效"; e.message="請確認地點名稱與經緯度。"; e.addAction("好"); await e.present(); return false;
  }
  cfg.placeName=name; cfg.latitude=lat; cfg.longitude=lon; cfg.cwaApiKey=a.textFieldValue(3).trim(); saveJSON(cfgFile,cfg); return true;
}
function codeText(c) {
  const m={0:"晴朗",1:"大致晴朗",2:"局部多雲",3:"陰天",45:"有霧",48:"霧凇",51:"毛毛雨",53:"毛毛雨",55:"強毛毛雨",61:"小雨",63:"中雨",65:"大雨",71:"小雪",73:"中雪",75:"大雪",80:"短暫陣雨",81:"陣雨",82:"強陣雨",95:"雷雨",96:"雷雨伴冰雹",99:"強雷雨"};
  return m[Number(c)] || "天氣資料";
}
function symbol(c, day) {
  c=Number(c); if(c===0)return day?"sun.max.fill":"moon.stars.fill";
  if([1,2].includes(c))return day?"cloud.sun.fill":"cloud.moon.fill";
  if([3,45,48].includes(c))return "cloud.fill";
  if(c>=51&&c<=67)return "cloud.drizzle.fill";
  if(c>=71&&c<=86)return "cloud.snow.fill";
  if(c>=95)return "cloud.bolt.rain.fill"; return "cloud.sun.fill";
}
async function weather() {
  const u="https://api.open-meteo.com/v1/forecast?latitude="+cfg.latitude+"&longitude="+cfg.longitude+
  "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m"+
  "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&daily=uv_index_max,sunrise,sunset,precipitation_probability_max,precipitation_sum"+
  "&forecast_days=2&timezone=Asia%2FTaipei";
  const d=await getJSON(u), c=d.current||{};
  const hours=[];
  if(d.hourly && Array.isArray(d.hourly.time)) {
    const now = c.time || "";
    let start=0;
    for(let i=0;i<d.hourly.time.length;i++) if(d.hourly.time[i]>=now){start=i;break;}
    for(let i=start;i<Math.min(start+6,d.hourly.time.length);i++) {
      hours.push({
        time:d.hourly.time[i],
        temp:d.hourly.temperature_2m ? d.hourly.temperature_2m[i] : null,
        rain:d.hourly.precipitation_probability ? d.hourly.precipitation_probability[i] : null,
        precipitation:d.hourly.precipitation ? d.hourly.precipitation[i] : null,
        code:d.hourly.weather_code ? d.hourly.weather_code[i] : null
      });
    }
  }
  return {
    temp:c.temperature_2m,feel:c.apparent_temperature,humidity:c.relative_humidity_2m,
    wind:c.wind_speed_10m,code:c.weather_code,day:c.is_day===1,
    rain:hours.length?hours[0].rain:null,precipitation:c.precipitation,
    precipitationSum:d.daily?.precipitation_sum?.[0],uv:d.daily?.uv_index_max?.[0],
    sunrise:d.daily?.sunrise?.[0],sunset:d.daily?.sunset?.[0],
    hours:hours,time:c.time
  };
}
async function fetchHourlyForecast() {
  const u="https://api.open-meteo.com/v1/forecast?latitude="+cfg.latitude+"&longitude="+cfg.longitude+
    "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&forecast_days=2&timezone=Asia%2FTaipei";
  const d=await getJSON(u);
  const times=d.hourly?.time||[];
  const temps=d.hourly?.temperature_2m||[];
  const rains=d.hourly?.precipitation_probability||[];
  const codes=d.hourly?.weather_code||[];
  const precip=d.hourly?.precipitation||[];
  const now=new Date();
  let start=times.findIndex(t=>new Date(t)>=now);
  if(start<0) start=0;
  const hours=[];
  for(let i=start;i<Math.min(start+6,times.length);i++) {
    hours.push({time:times[i],temp:temps[i]??null,rain:rains[i]??null,precipitation:precip[i]??null,code:codes[i]??null});
  }
  if(!hours.length) throw new Error("API 未提供逐時資料");
  return hours;
}
async function airQuality() {
  const u="https://air-quality-api.open-meteo.com/v1/air-quality?latitude="+cfg.latitude+"&longitude="+cfg.longitude+"&current=us_aqi,pm2_5&timezone=Asia%2FTaipei";
  const d=await getJSON(u); return {aqi:d.current?.us_aqi,pm25:d.current?.pm2_5,time:d.current?.time};
}
function parseCWARecords(d, sourceName) {
  const records=d.records||{};
  let list=records.Earthquake||records.earthquake||records.EarthquakeInfo||[];
  if(!Array.isArray(list)) list=[list];
  return list.map(e=>{
    const info=e.EarthquakeInfo||e.earthquakeInfo||e;
    const epic=info.Epicenter||info.epicenter||e.Epicenter||{};
    const mag=info.EarthquakeMagnitude||info.earthquakeMagnitude||e.EarthquakeMagnitude||{};
    const time=info.OriginTime||info.originTime||e.OriginTime||e.OriginTimeValue||"";
    const place=epic.Location||epic.location||e.ReportContent||e.EarthquakeNo||"台灣地區";
    const magnitude=mag.MagnitudeValue||mag.magnitudeValue||e.MagnitudeValue||null;
    const depth=info.FocalDepth||info.focalDepth||e.FocalDepth||null;
    const lat=epic.EpicenterLatitude||epic.epicenterLatitude||null;
    const lon=epic.EpicenterLongitude||epic.epicenterLongitude||null;
    return {source:sourceName,place:String(place),time:String(time),mag:magnitude==null?null:Number(magnitude),
      depth:depth==null?null:Number(depth),lat:lat==null?null:Number(lat),lon:lon==null?null:Number(lon)};
  }).filter(q=>q.time && q.mag!=null);
}
async function fetchCWAFeed(dataId, label) {
  if(!cfg.cwaApiKey) throw new Error("尚未設定 CWA API Key");
  const u="https://opendata.cwa.gov.tw/api/v1/rest/datastore/"+dataId+
    "?Authorization="+encodeURIComponent(cfg.cwaApiKey)+"&format=JSON";
  const d=await getJSON(u);
  const result=parseCWARecords(d,label);
  if(!result.length) throw new Error("CWA "+dataId+" 無可解析紀錄");
  return result;
}
async function cwaQuakes() {
  const all=[];
  const errors=[];
  try { all.push(...await fetchCWAFeed("E-A0015-001","CWA 顯著有感")); }
  catch(e) { errors.push("顯著地震："+e.message); }
  try { all.push(...await fetchCWAFeed("E-A0016-001","CWA 小區域有感")); }
  catch(e) { errors.push("小區域地震："+e.message); }
  const unique={};
  all.forEach(q=>{
    const key=[q.time,q.mag,q.lat,q.lon,q.place].join("|");
    unique[key]=q;
  });
  const list=Object.values(unique).sort((a,b)=>new Date(b.time)-new Date(a.time));
  return {list:list.slice(0,10),errors};
}
async function usgsQuake() {
  // Seven-day M2.5+ global feed, filtered to Taiwan and nearby waters.
  const d=await getJSON("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson");
  const list=(d.features||[]).filter(f=>{
    const c=f.geometry?.coordinates, mag=Number(f.properties?.mag);
    if(!c||!Number.isFinite(mag)||mag<2.5)return false;
    return c[1]>=18&&c[1]<=30&&c[0]>=115&&c[0]<=126;
  }).sort((a,b)=>b.properties.time-a.properties.time).slice(0,10);
  return list.map(f=>{
    const c=f.geometry.coordinates;
    return {source:"USGS 台灣周邊備援（近7天）",place:f.properties.place||"台灣周邊",
      time:new Date(f.properties.time).toISOString(),mag:Number(f.properties.mag),
      depth:Number(c[2]),lat:Number(c[1]),lon:Number(c[0])};
  });
}
async function quake() {
  const cwa=await cwaQuakes();
  if(cwa.list.length) {
    const list=cwa.list.filter(q=>Number.isFinite(q.lat)&&Number.isFinite(q.lon))
      .sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,10);
    return {list:cwa.list.slice(0,10),mapList:list,source:"CWA",status:"success",errors:cwa.errors};
  }
  try {
    const fallback=await usgsQuake();
    const list=Array.isArray(fallback)?fallback:[];
    return {list,mapList:list,source:"USGS",status:list.length?"fallback":"empty",errors:cwa.errors};
  } catch(e) {
    return {list:[],mapList:[],source:"—",status:"error",errors:cwa.errors.concat([String(e)])};
  }
}
async function refresh() {
  const out={updated:new Date().toISOString(),errors:[],status:{},diagnostics:{}};

  try {
    out.weather=await weather();
    out.status.weather="即時成功";
  } catch(e) {
    out.diagnostics.weather=String(e.message||e).slice(0,110);
    out.errors.push("天氣："+out.diagnostics.weather);
    out.weather=cache.weather||null;
    out.status.weather=out.weather?"使用快取":"失敗";
  }

  // Fetch hourly forecast separately so a current-conditions failure does not hide the forecast.
  try {
    const hours=await fetchHourlyForecast();
    if(!out.weather) out.weather={};
    out.weather.hours=hours;
    out.status.forecast="逐時資料成功";
  } catch(e) {
    out.status.forecast="逐時資料失敗";
    out.diagnostics.forecast=String(e.message||e).slice(0,110);
    if(out.weather?.hours?.length) out.status.forecast="使用快取";
  }

  try {
    out.air=await airQuality();
    out.status.air="即時成功";
  } catch(e) {
    out.diagnostics.air=String(e.message||e).slice(0,110);
    out.errors.push("空品："+out.diagnostics.air);
    out.air=cache.air||null;
    out.status.air=out.air?"使用快取":"失敗";
  }

  try {
    out.quake=await quake();
    out.status.quake=out.quake.status==="success"?"CWA 即時":
      out.quake.status==="fallback"?"USGS 備援":
      out.quake.status==="empty"?"無近期資料":"失敗";
    if(out.quake.errors?.length) {
      out.diagnostics.quake=out.quake.errors.join("；").slice(0,150);
      out.errors.push(...out.quake.errors);
    }
  } catch(e) {
    out.diagnostics.quake=String(e.message||e).slice(0,110);
    out.errors.push("地震："+out.diagnostics.quake);
    out.quake=cache.quake||{list:[],mapList:[],status:"error"};
    out.status.quake=out.quake.list?.length?"使用快取":"失敗";
  }

  try {
    out.alerts=await weatherAlerts();
    out.status.alerts="CWA 即時";
  } catch(e) {
    out.alerts=cache.alerts||[];
    out.status.alerts=out.alerts.length?"使用快取":"未取得";
    out.diagnostics.alerts=String(e.message||e).slice(0,100);
  }
  try {
    out.moonTimes=await officialMoonTimes();
    out.status.moonTimes="CWA 官方";
  } catch(e) {
    out.moonTimes=cache.moonTimes||null;
    out.status.moonTimes=out.moonTimes?"使用快取":"未取得";
    out.diagnostics.moonTimes=String(e.message||e).slice(0,100);
  }
  cache=out;
  saveJSON(cacheFile,cache);
  return out;
}

// v1.4.0 modules: CWA alerts, official moonrise/moonset and radar image.
async function fetchCWAJson(dataId) {
  if(!cfg.cwaApiKey) throw new Error("尚未設定 CWA API Key");
  const url="https://opendata.cwa.gov.tw/api/v1/rest/datastore/"+dataId+
    "?Authorization="+encodeURIComponent(cfg.cwaApiKey)+"&format=JSON";
  return await getJSON(url);
}
function walkObjects(root, fn) {
  const seen=[];
  function visit(x) {
    if(!x || typeof x!=="object" || seen.indexOf(x)>=0) return;
    seen.push(x); fn(x);
    if(Array.isArray(x)) x.forEach(visit);
    else Object.keys(x).forEach(k=>visit(x[k]));
  }
  visit(root);
}
async function weatherAlerts() {
  const d=await fetchCWAJson("W-C0033-001");
  const alerts=[];
  walkObjects(d.records||d, locationNode=>{
    const location=locationNode.locationName||locationNode.LocationName||"";
    const hc=locationNode.hazardConditions||locationNode.HazardConditions;
    if(!location || !hc) return;
    const hazards=[];
    walkObjects(hc, node=>{
      const phenomenon=node.phenomena||node.Phenomena;
      if(!phenomenon) return;
      const valid=node.validTime||node.ValidTime||{};
      hazards.push({
        location:String(location),
        phenomenon:String(phenomenon),
        significance:String(node.significance||node.Significance||"警特報"),
        start:valid.startTime||valid.StartTime||"",
        end:valid.endTime||valid.EndTime||""
      });
    });
    hazards.forEach(h=>{
      const key=[h.location,h.phenomenon,h.start,h.end].join("|");
      if(!alerts.some(a=>a.key===key)) alerts.push(Object.assign({key},h));
    });
  });
  return alerts;
}
async function officialMoonTimes() {
  const d=await fetchCWAJson("A-B0063-001");
  const target=(cfg.placeName||"").replace("臺","台");
  let found=null;
  walkObjects(d.records||d, o=>{
    const county=o.CountyName||o.countyName||o.locationName||o.LocationName||"";
    if(!county || String(county).replace("臺","台")!==target) return;
    const times=Array.isArray(o.time)?o.time:(Array.isArray(o.Time)?o.Time:null);
    if(!times) return;
    const now=new Date(), date=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
    const item=times.find(t=>(t.Date||t.date)===date);
    if(item) found={date,rise:item.MoonRiseTime||item.moonRiseTime||"",
      set:item.MoonSetTime||item.moonSetTime||"",transit:item.MoonTransitTime||item.moonTransitTime||"",
      riseAz:item.MoonRiseAZ||item.moonRiseAZ||"",setAz:item.MoonSetAZ||item.moonSetAZ||""};
  });
  if(!found) throw new Error("找不到 "+cfg.placeName+" 今日月出月沒資料");
  return found;
}
async function cwaRadarImage() {
  const req=new Request("https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-A0058-001.png");
  req.timeoutInterval=25;
  return await req.loadImage();
}

// Taiwan earthquake map: OpenStreetMap raster tiles + magnitude markers.
// OSM tiles require attribution and should not be prefetched in bulk.
function lonToTileX(lon,z) { return (lon+180)/360*Math.pow(2,z); }
function latToTileY(lat,z) {
  const rad=lat*Math.PI/180;
  return (1-Math.asinh(Math.tan(rad))/Math.PI)/2*Math.pow(2,z);
}
async function buildEarthquakeMap(quakes) {
  const W=520, H=390, Z=7;
  const west=117.2, east=125.5, north=27.5, south=20.0;
  const x0=lonToTileX(west,Z), x1=lonToTileX(east,Z);
  const y0=latToTileY(north,Z), y1=latToTileY(south,Z);
  const pxPerTile=W/(x1-x0), pyPerTile=H/(y1-y0);
  const ctx=new DrawContext();
  ctx.size=new Size(W,H); ctx.opaque=true; ctx.respectScreenScale=false;
  ctx.setFillColor(new Color("EAF1F5")); ctx.fillRect(new Rect(0,0,W,H));
  const nTiles=Math.pow(2,Z);
  const minX=Math.floor(x0), maxX=Math.floor(x1);
  const minY=Math.floor(y0), maxY=Math.floor(y1);
  for(let ty=minY;ty<=maxY;ty++) {
    for(let tx=minX;tx<=maxX;tx++) {
      try {
        const url="https://tile.openstreetmap.org/"+Z+"/"+(tx%nTiles)+"/"+ty+".png";
        const req=new Request(url);
        req.timeoutInterval=12;
        req.headers={"User-Agent":"JerryDataCenter/1.2 (Scriptable iPad widget)","Accept":"image/png"};
        const img=await req.loadImage();
        const dx=(tx-x0)*pxPerTile, dy=(ty-y0)*pyPerTile;
        ctx.drawImageInRect(img,new Rect(dx,dy,pxPerTile+1,pyPerTile+1));
      } catch(e) {
        // Keep the neutral map background if an individual tile is unavailable.
      }
    }
  }
  // Overlay earthquake epicentres with magnitude-scaled circles.
  (quakes||[]).forEach(q=>{
    const lat=Number(q.lat), lon=Number(q.lon), mag=Number(q.mag);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(mag)) return;
    if(lon<west||lon>east||lat<south||lat>north) return;
    const x=(lonToTileX(lon,Z)-x0)*pxPerTile;
    const y=(latToTileY(lat,Z)-y0)*pyPerTile;
    const radius=Math.max(5,Math.min(15,4+mag*1.5));
    ctx.setFillColor(new Color("E24B4B",0.78));
    ctx.fillEllipse(new Rect(x-radius,y-radius,radius*2,radius*2));
    ctx.setStrokeColor(new Color("FFFFFF",0.95));
    ctx.setLineWidth(2);
    ctx.strokeEllipse(new Rect(x-radius,y-radius,radius*2,radius*2));
  });
  // Small map title and mandatory OSM attribution.
  ctx.setFillColor(new Color("FFFFFF",0.88));
  ctx.fillRect(new Rect(10,10,150,27));
  ctx.setTextColor(new Color("243247"));
  ctx.setFont(Font.semiboldSystemFont(12));
  ctx.drawTextInRect("TAIWAN SEISMIC MAP",new Rect(18,15,140,18));
  ctx.setTextColor(new Color("334155"));
  ctx.setFont(Font.systemFont(9));
  ctx.drawTextInRect("© OpenStreetMap contributors",new Rect(8,H-18,220,14));
  return ctx.getImage();
}
async function addEarthquakeMapCard(widget, data) {
  const c=card(widget);
  title(c,"JERRY EARTH · TAIWAN EARTHQUAKE MAP");
  try {
    const points=data.quake?.mapList || data.quake?.list || [];
    const image=await buildEarthquakeMap(points);
    const im=c.addImage(image);
    im.imageSize=new Size(290,172);
    const count=points.filter(q=>Number.isFinite(Number(q.lat))&&Number.isFinite(Number(q.lon))).length;
    small(c,count ? "近7天標記 "+count+" 個有座標事件 · 圓點大小代表規模" : "近7天沒有可繪製的地震座標；地圖底圖仍可查看");
  } catch(e) {
    small(c,"地震地圖暫時無法載入："+String(e.message||e).slice(0,80));
  }
}

function aqInfo(v) {
  if(v==null)return ["—","資料暫缺",new Color("64748B")];
  v=Number(v); if(v<=50)return [n(v),"良好",new Color("16845B")];
  if(v<=100)return [n(v),"普通",new Color("A87918")];
  if(v<=150)return [n(v),"敏感族群注意",new Color("C66A24")];
  if(v<=200)return [n(v),"不健康",new Color("C64B4B")];
  if(v<=300)return [n(v),"非常不健康",new Color("8C4C9E")];
  return [n(v),"危害",new Color("7D2635")];
}
function text(parent,s,size,color,weight="regular") {
  const t=parent.addText(String(s)); t.font=weight==="bold"?Font.boldSystemFont(size):Font.systemFont(size); t.textColor=color; t.lineLimit=1; return t;
}
function small(parent,s) { return text(parent,s,9,new Color("64748B")); }
function title(parent,s) { return text(parent,s,8,new Color("718096"),"bold"); }
function val(parent,s,size=17,color=new Color("172033")) { return text(parent,s,size,color,"bold"); }
function card(parent) {
  const c=parent.addStack(); c.layoutVertically(); c.backgroundColor=new Color("FFFFFF",0.72); c.cornerRadius=12; c.setPadding(5,6,5,6); c.spacing=1; return c;
}
function widgetBase() {
  const w=new ListWidget(), g=new LinearGradient();
  g.colors=[new Color("F8FBFF",0.98),new Color("E8F0FA",0.96),new Color("F5F7FB",0.98)];
  g.locations=[0,0.55,1]; g.startPoint=new Point(0,0); g.endPoint=new Point(1,1);
  w.backgroundGradient=g; w.setPadding(6,8,6,8); w.spacing=3;
  w.refreshAfterDate=new Date(Date.now()+Math.max(20,cfg.refreshMinutes)*60000); return w;
}
function header(w) {
  const r=w.addStack(); r.centerAlignContent();
  const l=r.addStack(); l.layoutVertically(); title(l,"JERRY DATA CENTER"); val(l,cfg.placeName,11);
  r.addSpacer(); const rt=r.addStack(); rt.layoutVertically(); small(rt,"LIVE DATA"); small(rt,fmt(new Date()));
}

// Moon phase calculation: Meeus-style mean synodic month approximation.
// No external API or API key required; phase is computed locally from UTC time.
function getMoonPhase(date) {
  const synodicMonth = 29.530588853;
  const knownNewMoon = Date.UTC(2000,0,6,18,14,0);
  const days = (date.getTime() - knownNewMoon) / 86400000;
  const age = ((days % synodicMonth) + synodicMonth) % synodicMonth;
  const phase = age / synodicMonth; // 0=new, 0.5=full
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  let name;
  if (phase < 0.035 || phase >= 0.965) name = "朔月";
  else if (phase < 0.22) name = "眉月（盈）";
  else if (phase < 0.28) name = "上弦月";
  else if (phase < 0.47) name = "盈凸月";
  else if (phase < 0.53) name = "滿月";
  else if (phase < 0.72) name = "虧凸月";
  else if (phase < 0.78) name = "下弦月";
  else name = "殘月（虧）";
  return {age, phase, illumination, name, waxing:phase < 0.5};
}
function nextPrincipalMoonPhases(date) {
  const synodic=29.530588853;
  const age=getMoonPhase(date).age;
  const daysToNew=synodic-age;
  const daysToFull=(age<synodic/2)?(synodic/2-age):(synodic+synodic/2-age);
  const fmtDate=d=>{
    const f=new DateFormatter(); f.locale="zh_TW"; f.timeZone="Asia/Taipei"; f.dateFormat="MM/dd";
    return f.string(d);
  };
  return {
    fullDate:fmtDate(new Date(date.getTime()+daysToFull*86400000)),
    newDate:fmtDate(new Date(date.getTime()+daysToNew*86400000)),
    fullDays:daysToFull,
    newDays:daysToNew
  };
}
function drawMoonImage(moon) {
  const size=104, radius=43, center=size/2;
  const ctx=new DrawContext();
  ctx.size=new Size(size,size);
  ctx.opaque=false;
  ctx.respectScreenScale=false;
  // Warm ivory lunar disc.
  ctx.setFillColor(new Color("F2E7C8"));
  ctx.fillEllipse(new Rect(center-radius,center-radius,radius*2,radius*2));
  // Dark portion offset across the disc to represent the illuminated phase.
  const shift=radius*(1-Math.cos(2*Math.PI*moon.phase));
  const offset=moon.waxing ? -shift : shift;
  ctx.setFillColor(new Color("536174"));
  ctx.fillEllipse(new Rect(center-radius+offset,center-radius,radius*2,radius*2));
  // A subtle outline keeps the moon legible on light glass.
  ctx.setStrokeColor(new Color("C9B98F",0.85));
  ctx.setLineWidth(1.2);
  ctx.strokeEllipse(new Rect(center-radius,center-radius,radius*2,radius*2));
  return ctx.getImage();
}
function moonCard(w) {
  const moon=getMoonPhase(new Date());
  const c=card(w);
  title(c,"MOON PHASE · 月相");
  const r=c.addStack();
  r.centerAlignContent();
  const image=r.addImage(drawMoonImage(moon));
  image.imageSize=new Size(62,62);
  r.addSpacer(9);
  const info=r.addStack();
  info.layoutVertically();
  val(info,moon.name,17,new Color("243247"));
  small(info,"照明率 "+n(moon.illumination*100,1)+"%");
  small(info,"月齡 "+n(moon.age,1)+" / 29.53 天");
  r.addSpacer();
  small(r,moon.waxing?"盈":"虧");
  small(c,"依天文朔望月週期計算 · 不需 API Key");
}

function weatherCard(w,d) {
  const c=card(w); title(c,"WEATHER NOW");
  const r=c.addStack(); r.centerAlignContent();
  const sf=SFSymbol.named(symbol(d.code,d.day)); sf.applyFont(Font.systemFont(28));
  const im=r.addImage(sf.image); im.imageSize=new Size(29,29); im.tintColor=new Color("D49A36");
  r.addSpacer(7); const main=r.addStack(); main.layoutVertically(); val(main,d.temp==null?"—":n(d.temp)+"°",27); small(main,codeText(d.code));
  r.addSpacer(); const details=r.addStack(); details.layoutVertically();
  small(details,"體感 "+(d.feel==null?"—":n(d.feel)+"°")); small(details,"濕度 "+(d.humidity==null?"—":n(d.humidity)+"%")); small(details,"風速 "+(d.wind==null?"—":n(d.wind)+" km/h"));
  small(c,"降雨 "+(d.rain==null?"—":n(d.rain)+"%")+"     今日 UV "+(d.uv==null?"—":n(d.uv)));
}
function airCard(w,d) {
  const c=card(w); title(c,"AIR QUALITY"); const r=c.addStack(); r.centerAlignContent();
  const a=aqInfo(d?.aqi); val(r,"AQI "+a[0],20,a[2]); r.addSpacer(); small(r,a[1]);
  small(c,"PM2.5  "+(d?.pm25==null?"—":n(d.pm25,1)+" µg/m³"));
}
function forecastCard(w,d) {
  const c=card(w); title(c,"NEXT HOURS · 逐時預報");
  if(!d || !d.hours || !d.hours.length) { small(c,"目前沒有逐時預報資料；請查看資料來源狀態"); return; }
  d.hours.slice(0,2).forEach((h,i)=>{
    const r=c.addStack(); r.centerAlignContent();
    const dt=new Date(h.time);
    const f=new DateFormatter();f.locale="zh_TW";f.timeZone="Asia/Taipei";f.dateFormat="HH:mm";
    small(r,f.string(dt));
    r.addSpacer(7);
    val(r,h.temp==null?"—":n(h.temp)+"°",10);
    r.addSpacer();
    small(r,"降雨 "+(h.rain==null?"—":n(h.rain)+"%"));
  });
}
function quakeCard(w,d) {
  const c=card(w); title(c,"LATEST EARTHQUAKES · 最新地震");
  const list=d?.list||[];
  if(!list.length){
    small(c,"近7天沒有取得符合範圍的 M2.5+ 地震紀錄");
    small(c,"CWA 官方資料需設定 API Key；USGS 為備援來源");
    small(c,"來源狀態："+(d?.status||"未知"));
    return;
  }
  list.slice(0,2).forEach((q,i)=>{
    const r=c.addStack();r.centerAlignContent();
    val(r,q.mag==null?"—":"M "+n(q.mag,1),i===0?15:12,new Color("B4534B"));
    r.addSpacer(7);
    const p=r.addStack();p.layoutVertically();
    text(p,q.place||"位置未提供",10,new Color("243247"),"bold");
    small(p,(q.time?fmt(q.time):"時間未提供")+" · "+(q.source||d.source||""));
    r.addSpacer();
    if(q.depth!=null)small(r,n(q.depth)+"km");
  });
}
function statusCard(w,d) {
  const c=card(w);title(c,"DATA STATUS");
  const r=c.addStack();r.centerAlignContent();
  small(r,"天氣 "+(d.status?.weather||"未知"));
  r.addSpacer(5);
  small(r,"預報 "+(d.status?.forecast||"未知"));
  r.addSpacer(5);
  small(r,"空品 "+(d.status?.air||"未知"));
  r.addSpacer(5);
  small(r,"地震 "+(d.status?.quake||"未知"));
  const diagnostic=d.diagnostics||{};
  ["weather","forecast","air","quake"].forEach(k=>{
    if(diagnostic[k]) {
      const line=small(c,k.toUpperCase()+"："+diagnostic[k]);
      line.lineLimit=1;
    }
  });
}
function footer(w,d) {
  const r=w.addStack(); small(r,"更新 "+fmt(d.updated)); r.addSpacer(); small(r,"v1.4.1");
  if(d.errors?.length)small(w,"注意：部分資料源有錯誤，請查看來源狀態");
}

function weatherMini(w,d) {
  const c=card(w); title(c,"WEATHER · 即時天氣");
  const r=c.addStack(); r.centerAlignContent();
  val(r,d?.temp==null?"—":n(d.temp)+"°",22);
  r.addSpacer(6);
  const info=r.addStack(); info.layoutVertically();
  small(info,codeText(d?.code));
  small(info,"體感 "+(d?.feel==null?"—":n(d.feel)+"°")+" · 濕度 "+(d?.humidity==null?"—":n(d.humidity)+"%"));
}
function airMini(w,d) {
  const c=card(w); title(c,"AIR QUALITY · 空品");
  const r=c.addStack(); r.centerAlignContent();
  const a=aqInfo(d?.aqi);
  val(r,"AQI "+a[0],19,a[2]); r.addSpacer();
  small(r,a[1]);
  small(c,"PM2.5 "+(d?.pm25==null?"—":n(d.pm25,1)+" µg/m³"));
}
function forecastMini(w,d) {
  const c=card(w); title(c,"RAIN & FORECAST · 降雨預報");
  if(!d?.hours?.length) { small(c,"暫無逐時資料"); return; }
  d.hours.slice(0,2).forEach(h=>{
    const r=c.addStack(); r.centerAlignContent();
    const f=new DateFormatter(); f.locale="zh_TW"; f.timeZone="Asia/Taipei"; f.dateFormat="HH:mm";
    small(r,f.string(new Date(h.time))); r.addSpacer(4);
    val(r,h.temp==null?"—":n(h.temp)+"°",10); r.addSpacer();
    small(r,"雨 "+(h.rain==null?"—":n(h.rain)+"%"));
    small(r," "+(h.precipitation==null?"—":n(h.precipitation,1)+"mm"));
  });
  small(c,"當前時段降水 "+(d.precipitation==null?"—":n(d.precipitation,1)+" mm")+" · 今日預報 "+(d.precipitationSum==null?"—":n(d.precipitationSum,1)+" mm"));
}
function moonMini(w,d) {
  const now=new Date(), moon=getMoonPhase(now), next=nextPrincipalMoonPhases(now);
  const c=card(w); title(c,"MOON · 月相與月出月沒");
  const r=c.addStack(); r.centerAlignContent();
  const image=r.addImage(drawMoonImage(moon)); image.imageSize=new Size(42,42);
  r.addSpacer(5);
  const info=r.addStack(); info.layoutVertically();
  val(info,moon.name,12,new Color("243247"));
  small(info,"照明 "+n(moon.illumination*100,0)+"% · 月齡 "+n(moon.age,1)+"天");
  const m=d?.moonTimes;
  small(info,"月出 "+(m?.rise||"—")+" / 月沒 "+(m?.set||"—"));
  small(info,"滿月約 "+next.fullDate+" · 新月約 "+next.newDate);
}
function moonTimesMini(w,d) {
  const c=card(w); title(c,"MOONRISE / MOONSET · 官方月出月沒");
  const m=d?.moonTimes;
  if(!m) { small(c,"需設定 CWA API Key 才能取得官方時刻"); return; }
  const r=c.addStack(); r.centerAlignContent();
  small(r,"月出"); val(r,m.rise||"—",12); r.addSpacer(7);
  small(r,"月沒"); val(r,m.set||"—",12);
  if(m.transit) small(c,"過中天 "+m.transit);
}
function alertBanner(w,d) {
  const c=w.addStack(); c.layoutHorizontally(); c.centerAlignContent();
  c.backgroundColor=new Color("FFFFFF",0.82); c.cornerRadius=9; c.setPadding(4,7,4,7); c.spacing=4;
  const list=d?.alerts||[];
  if(d?.status?.alerts==="CWA 即時") {
    if(list.length) {
      val(c,"⚠",12,new Color("B45309"));
      const first=list[0];
      small(c,"警特報 "+first.location+" · "+first.phenomenon);
      c.addSpacer();
      small(c,list.length>1?"+"+(list.length-1):"注意");
    } else {
      val(c,"●",9,new Color("16845B"));
      small(c,"目前無警報");
      c.addSpacer();
      small(c,"中央氣象署資料已取得");
    }
  } else {
    val(c,"!",11,new Color("B7791F"));
    small(c,"警報資料暫不可用");
    c.addSpacer();
    small(c,"非代表無警報");
  }
}
async function radarMini(w) {
  const c=card(w); title(c,"CWA RADAR · 台灣雷達回波");
  try {
    const img=await cwaRadarImage();
    const im=c.addImage(img); im.imageSize=new Size(158,126);
    small(c,"中央氣象署 O-A0058-001 · 約每10分鐘更新");
  } catch(e) {
    small(c,"雷達圖暫時無法載入："+String(e.message||e).slice(0,55));
  }
}
async function earthquakeMini(w,d) {
  const c=card(w); title(c,"EARTHQUAKE · 台灣地震");
  try {
    const points=d.quake?.mapList||d.quake?.list||[];
    const img=await buildEarthquakeMap(points);
    const im=c.addImage(img); im.imageSize=new Size(158,126);
    const count=points.filter(q=>Number.isFinite(Number(q.lat))&&Number.isFinite(Number(q.lon))).length;
    small(c,count+" 個震央標記 · "+(d.quake?.source||"來源待確認"));
  } catch(e) { small(c,"地震地圖暫時無法載入"); }
}
async function mapDashboardCard(w,d) {
  const c=card(w); title(c,"JERRY EARTH · 台灣地震地圖");
  const row=c.addStack(); row.centerAlignContent(); row.spacing=7;
  try {
    const points=d.quake?.mapList || d.quake?.list || [];
    const image=await buildEarthquakeMap(points);
    const im=row.addImage(image); im.imageSize=new Size(170,128);
    const info=row.addStack(); info.layoutVertically();
    const count=points.filter(q=>Number.isFinite(Number(q.lat))&&Number.isFinite(Number(q.lon))).length;
    val(info,String(count),23,new Color("B4534B"));
    small(info,"個震央標記");
    info.addSpacer(3);
    const latest=(d.quake?.list||[])[0];
    if(latest) {
      small(info,"最新 M"+n(latest.mag,1));
      small(info,latest.place||"位置未提供");
      if(latest.depth!=null) small(info,"深度 "+n(latest.depth)+" km");
    } else {
      small(info,"近7天暫無");
      small(info,"符合條件地震");
      small(info,"可繪製座標");
    }
    info.addSpacer();
    small(info,d.quake?.source||"USGS / CWA");
  } catch(e) {
    small(row,"地圖載入失敗："+String(e.message||e).slice(0,70));
  }
  small(c,"© OpenStreetMap contributors · 圓點大小代表規模");
}
function quakeStatusMini(w,d) {
  const c=card(w);
  const r=c.addStack(); r.centerAlignContent();
  small(r,"資料狀態");
  r.addSpacer(4);
  small(r,"天氣 "+(d.status?.weather||"—"));
  r.addSpacer(4);
  small(r,"空品 "+(d.status?.air||"—"));
  r.addSpacer(4);
  small(r,"地震 "+(d.status?.quake||"—"));
  r.addSpacer();
  small(r,"更新 "+fmt(d.updated));
}

async function makeWidget(d) {
  const w=widgetBase(); header(w); w.addSpacer(2);
  const size=cfg.widgetSize||"large";
  if(size==="small") {
    if(d.weather){const c=card(w);title(c,"WEATHER");val(c,d.weather.temp==null?"—":n(d.weather.temp)+"°",27);small(c,codeText(d.weather.code));}
    moonCard(w);
    if(d.quake){const q=d.quake.list?.[0];const c=card(w);title(c,"EARTHQUAKE");val(c,q?.mag==null?"—":"M "+n(q.mag,1),18,new Color("B4534B"));small(c,q?.place||"近期無資料");}
  } else if(size==="medium") {
    const r=w.addStack();r.spacing=7;
    if(d.weather){const c=card(r);c.layoutVertically();title(c,"WEATHER");val(c,d.weather.temp==null?"—":n(d.weather.temp)+"°",25);small(c,codeText(d.weather.code));small(c,"體感 "+n(d.weather.feel)+"° · 濕度 "+n(d.weather.humidity)+"%");}
    if(d.air){const c=card(r);title(c,"AIR QUALITY");const a=aqInfo(d.air.aqi);val(c,"AQI "+a[0],21,a[2]);small(c,a[1]);small(c,"PM2.5 "+n(d.air.pm25,1));}
    moonCard(w);
    quakeCard(w,d.quake);footer(w,d);
  } else {
    // Large dashboard v1.4.1: alert banner first, then paired data and enlarged maps.
    alertBanner(w,d);
    const row1=w.addStack(); row1.spacing=5;
    if(d.weather) weatherMini(row1,d.weather);
    if(d.air) airMini(row1,d.air);
    const row2=w.addStack(); row2.spacing=5;
    moonMini(row2,d);
    forecastMini(row2,d.weather);
    const row3=w.addStack(); row3.spacing=5;
    await radarMini(row3);
    await earthquakeMini(row3,d);
    const foot=w.addStack(); small(foot,"JERRY DATA CENTER · TAIWAN OBSERVATORY"); foot.addSpacer(); small(foot,"v1.4.1");
  }
  return w;
}
async function main() {
  if (config.runsInWidget) {
    // Widget execution must not show alerts. Configure once by running the script in the app.
    if (cfg.latitude == null || cfg.longitude == null || !cfg.placeName) {
      const empty = widgetBase();
      val(empty, "請先開啟 Scriptable 執行腳本並設定地點", 13);
      Script.setWidget(empty);
      Script.complete();
      return;
    }
    const data = await refresh();
    Script.setWidget(await makeWidget(data));
    Script.complete();
    return;
  }

  if (cfg.latitude == null || cfg.longitude == null || !cfg.placeName) {
    if (!(await configure())) return;
  } else {
    const menu = new Alert();
    menu.title = "JERRY DATA CENTER";
    menu.message = "v1.4.1：警報置頂、放大地圖、月相與朔望日期。";
    menu.addAction("更新並預覽");
    menu.addAction("修改地點／API Key");
    menu.addCancelAction("取消");
    const choice = await menu.present();
    if (choice === 1) {
      if (!(await configure())) return;
    } else if (choice !== 0) return;
  }

  const data = await refresh();
  const sizeAlert = new Alert();
  sizeAlert.title = "預覽尺寸";
  sizeAlert.message = "選擇要預覽的 Widget 尺寸。";
  sizeAlert.addAction("大型");
  sizeAlert.addAction("中型");
  sizeAlert.addAction("小型");
  const ix = await sizeAlert.present();
  cfg.widgetSize = ix === 1 ? "medium" : ix === 2 ? "small" : "large";
  saveJSON(cfgFile, cfg);
  const w = await makeWidget(data);
  // Scriptable builds differ in which in-app ListWidget preview methods they expose.
  // Always save the widget first; only call a preview method when the runtime supports it.
  Script.setWidget(w);
  const previewMethod = ix === 0 ? "presentLarge" : ix === 1 ? "presentMedium" : "presentSmall";
  if (typeof w[previewMethod] === "function") {
    await w[previewMethod]();
  } else {
    const notice = new Alert();
    notice.title = "Widget 已建立";
    notice.message = "目前 Scriptable 版本未提供此尺寸的程式內預覽功能。Widget 已建立，請回到 iPad 主畫面，長按空白處 → 加入 Widget → Scriptable，然後選擇 JERRY DATA CENTER。";
    notice.addAction("知道了");
    await notice.present();
  }
  Script.complete();
}
await main();
