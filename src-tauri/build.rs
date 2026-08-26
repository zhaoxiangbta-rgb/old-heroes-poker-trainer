fn main() {
    generate_mobile_assets();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-app-manifest.xml");
        let resource = std::path::Path::new(&std::env::var("OUT_DIR").unwrap())
            .join("windows-app-manifest.res");
        println!("cargo:rerun-if-changed={}", manifest.display());
        write_manifest_resource(&resource, &std::fs::read(manifest).unwrap());
        println!("cargo:rustc-link-arg-bin=poker-decision-trainer={}", resource.display());
    }

    tauri_build::build();
}

fn generate_mobile_assets() {
    use std::fmt::Write as _;
    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let dist = manifest_dir.join("../dist");
    let output = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("mobile_assets.rs");
    println!("cargo:rerun-if-changed={}", dist.display());
    let mut files = Vec::new();
    fn walk(root: &std::path::Path, dir: &std::path::Path, files: &mut Vec<(String, std::path::PathBuf)>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return; };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() { walk(root, &path, files); }
            else if let Ok(relative) = path.strip_prefix(root) {
                let route = format!("/{}", relative.to_string_lossy().replace('\\', "/"));
                if route == "/mobile/index.html" || route.starts_with("/mobile-") || route.starts_with("/assets/") {
                    files.push((route, path));
                }
            }
        }
    }
    walk(&dist, &dist, &mut files);
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let mut generated = String::from("pub static MOBILE_ASSETS: &[(&str, &[u8])] = &[\n");
    for (route, path) in files {
        writeln!(generated, "    ({route:?}, include_bytes!({path:?})),").unwrap();
    }
    generated.push_str("];\n");
    std::fs::write(output, generated).unwrap();
}

fn write_manifest_resource(path: &std::path::Path, manifest: &[u8]) {
    fn word(output: &mut Vec<u8>, value: u16) {
        output.extend_from_slice(&value.to_le_bytes());
    }

    fn dword(output: &mut Vec<u8>, value: u32) {
        output.extend_from_slice(&value.to_le_bytes());
    }

    fn header(output: &mut Vec<u8>, data_size: u32, resource_type: u16, name: u16) {
        dword(output, data_size);
        dword(output, 32);
        word(output, 0xffff);
        word(output, resource_type);
        word(output, 0xffff);
        word(output, name);
        dword(output, 0);
        word(output, 0x1030);
        word(output, 0);
        dword(output, 0);
        dword(output, 0);
    }

    let mut output = Vec::with_capacity(64 + manifest.len() + 3);
    header(&mut output, 0, 0, 0);
    header(&mut output, manifest.len() as u32, 24, 1);
    output.extend_from_slice(manifest);
    while output.len() % 4 != 0 {
        output.push(0);
    }
    std::fs::write(path, output).unwrap();
}
