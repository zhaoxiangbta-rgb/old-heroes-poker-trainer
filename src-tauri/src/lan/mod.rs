mod server;

pub use server::{LanService, LanStatus};

#[cfg(test)]
mod tests {
    use super::server::{asset, LanService};
    use std::io::{Read, Write};
    use std::net::TcpStream;

    #[test]
    fn asset_map_rejects_traversal_and_desktop_html() {
        assert!(asset("/mobile/").is_some());
        assert!(asset("/../trainer-v1.sqlite3").is_none());
        assert!(asset("/index.html").is_none());
    }

    #[test]
    fn service_starts_once_and_stops_cleanly() {
        let service = LanService::new(0);
        let status = service.start().expect("start");
        assert!(status.running);
        assert!(status.port > 0);
        let url = status.bootstrap_url.as_deref().expect("local URL");
        assert!(url.ends_with(&format!(":{}/mobile/", status.port)));
        assert!(!url.contains("token="));
        let mut stream = TcpStream::connect(("127.0.0.1", status.port)).expect("connect");
        stream.write_all(b"GET /mobile/ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").expect("request");
        let mut response = Vec::new();
        stream.read_to_end(&mut response).expect("response");
        let header_end = response.windows(4).position(|part| part == b"\r\n\r\n").expect("headers") + 4;
        let headers = String::from_utf8(response[..header_end].to_vec()).expect("UTF-8 headers");
        assert!(headers.starts_with("HTTP/1.1 200 OK"));
        assert!(headers.contains("script-src 'self' 'unsafe-inline'"));
        assert!(service.start().is_err());
        service.stop().expect("stop");
        assert!(!service.status().running);
    }

    #[test]
    fn compresses_the_large_mobile_page_for_phone_browsers() {
        let service = LanService::new(0);
        let status = service.start().expect("start");
        let mut stream = TcpStream::connect(("127.0.0.1", status.port)).expect("connect");
        stream.write_all(b"GET /mobile/ HTTP/1.1\r\nHost: localhost\r\nAccept-Encoding: gzip, deflate\r\nConnection: close\r\n\r\n").expect("request");
        let mut response = Vec::new();
        stream.read_to_end(&mut response).expect("response");
        let header_end = response.windows(4).position(|part| part == b"\r\n\r\n").expect("headers") + 4;
        let headers = String::from_utf8_lossy(&response[..header_end]);
        assert!(headers.contains("Content-Encoding: gzip"));
        let compressed_size = response.len() - header_end;
        assert!(compressed_size < 160_000, "compressed page including pre-action insights must stay within its phone transfer budget: {compressed_size} bytes");
        service.stop().expect("stop");
    }
}
