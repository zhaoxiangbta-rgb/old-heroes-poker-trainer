use serde::Serialize;
use flate2::{write::GzEncoder, Compression};
use std::io::Write;
use std::net::{Ipv4Addr, TcpListener, UdpSocket};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tiny_http::{Header, Request, Response, Server, StatusCode};

include!(concat!(env!("OUT_DIR"), "/mobile_assets.rs"));

pub fn asset(path: &str) -> Option<(&'static [u8], &'static str)> {
    if path.contains("..") || path.contains('\\') { return None; }
    let normalized = if path == "/mobile" || path == "/mobile/" { "/mobile/index.html" } else { path };
    MOBILE_ASSETS.iter().find(|(route, _)| *route == normalized).map(|(_, bytes)| {
        let content_type = if normalized.ends_with(".html") { "text/html; charset=utf-8" }
        else if normalized.ends_with(".js") { "text/javascript; charset=utf-8" }
        else if normalized.ends_with(".css") { "text/css; charset=utf-8" }
        else if normalized.ends_with(".svg") { "image/svg+xml" }
        else if normalized.ends_with(".png") { "image/png" }
        else { "application/octet-stream" };
        (*bytes, content_type)
    })
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanStatus {
    pub running: bool,
    pub port: u16,
    pub bootstrap_url: Option<String>,
    pub fallback_urls: Vec<String>,
    pub active_sessions: usize,
    pub mdns_available: bool,
}

struct Running {
    port: u16,
    url: String,
    stop: Arc<AtomicBool>,
    server: Arc<Server>,
    thread: Option<JoinHandle<()>>,
}

pub struct LanService { preferred_port: u16, running: Mutex<Option<Running>> }

impl LanService {
    pub fn new(preferred_port: u16) -> Self { Self { preferred_port, running: Mutex::new(None) } }

    pub fn start(&self) -> Result<LanStatus, String> {
        let mut state = self.running.lock().map_err(|_| "手机访问服务暂时不可用")?;
        if state.is_some() { return Err("手机访问已经开启".into()); }
        let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, self.preferred_port))
            .map_err(|_| "端口已被占用，请修改端口或关闭占用程序".to_string())?;
        let port = listener.local_addr().map_err(|_| "无法读取服务端口".to_string())?.port();
        let server = Arc::new(Server::from_listener(listener, None)
            .map_err(|_| "无法启动手机访问服务".to_string())?);
        let ip = local_ipv4().unwrap_or(Ipv4Addr::LOCALHOST);
        let url = format!("http://{ip}:{port}/mobile/");
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let thread_server = server.clone();
        let handle = thread::spawn(move || serve(thread_server, thread_stop));
        *state = Some(Running { port, url, stop, server, thread: Some(handle) });
        drop(state);
        Ok(self.status())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut state = self.running.lock().map_err(|_| "手机访问服务暂时不可用")?;
        if let Some(mut running) = state.take() {
            running.stop.store(true, Ordering::Relaxed);
            running.server.unblock();
            if let Some(handle) = running.thread.take() { let _ = handle.join(); }
        }
        Ok(())
    }

    pub fn rotate(&self) -> Result<LanStatus, String> {
        let state = self.running.lock().map_err(|_| "手机访问服务暂时不可用")?;
        let Some(running) = state.as_ref() else { return Err("请先开启手机访问".into()); };
        Ok(status_for(running))
    }

    pub fn status(&self) -> LanStatus {
        self.running.lock().ok().and_then(|state| state.as_ref().map(status_for)).unwrap_or(LanStatus {
            running: false, port: self.preferred_port, bootstrap_url: None,
            fallback_urls: Vec::new(), active_sessions: 0, mdns_available: false,
        })
    }
}

impl Drop for LanService { fn drop(&mut self) { let _ = self.stop(); } }

fn status_for(running: &Running) -> LanStatus {
    LanStatus { running: true, port: running.port, bootstrap_url: Some(running.url.clone()), fallback_urls: vec![running.url.clone()], active_sessions: 0, mdns_available: false }
}

fn local_ipv4() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() { std::net::IpAddr::V4(ip) if !ip.is_loopback() => Some(ip), _ => None }
}

fn serve(server: Arc<Server>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::Relaxed) {
        match server.recv_timeout(Duration::from_millis(100)) {
            Ok(Some(request)) => handle_request(request),
            Ok(None) => continue,
            Err(_) => break,
        }
    }
}

fn handle_request(request: Request) {
    let target = request.url();
    let path = target.split_once('?').map(|(path, _)| path).unwrap_or(target);
    let accepts_gzip = request.headers().iter().any(|header| {
        header.field.equiv("Accept-Encoding") && header.value.as_str().to_ascii_lowercase().contains("gzip")
    });
    if path == "/_lan/health" {
        respond(request, StatusCode(200), "application/json", br#"{"ok":true}"#.to_vec(), false);
        return;
    }
    match asset(path) {
        Some((body, content_type)) if accepts_gzip && body.len() > 4096 => {
            let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
            if encoder.write_all(body).is_ok() {
                if let Ok(compressed) = encoder.finish() {
                    respond(request, StatusCode(200), content_type, compressed, true);
                    return;
                }
            }
            respond(request, StatusCode(500), "text/plain; charset=utf-8", "压缩页面失败".as_bytes().to_vec(), false);
        }
        Some((body, content_type)) => respond(request, StatusCode(200), content_type, body.to_vec(), false),
        None => respond(request, StatusCode(404), "text/plain; charset=utf-8", "未找到页面".as_bytes().to_vec(), false),
    }
}

fn respond(request: Request, status: StatusCode, content_type: &str, body: Vec<u8>, gzip: bool) {
    let mut response = Response::from_data(body).with_status_code(status);
    for (name, value) in [
        ("Content-Type", content_type),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
        ("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'"),
        ("Referrer-Policy", "no-referrer"),
    ] {
        response.add_header(Header::from_bytes(name, value).expect("static HTTP header"));
    }
    if gzip {
        response.add_header(Header::from_bytes("Content-Encoding", "gzip").expect("gzip header"));
        response.add_header(Header::from_bytes("Vary", "Accept-Encoding").expect("vary header"));
    }
    let _ = request.respond(response);
}
