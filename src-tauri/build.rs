fn main() {
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
