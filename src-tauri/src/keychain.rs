const SERVICE: &str = "com.decisionlab.pokertrainer";
const USER: &str = "openai-compatible-api-key";
pub fn set(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("密钥不能为空".into());
    }
    keyring::Entry::new(SERVICE, USER)
        .map_err(|_| "无法访问系统凭据库")?
        .set_password(value)
        .map_err(|_| "无法写入系统凭据库".into())
}
pub fn get() -> Result<String, String> {
    keyring::Entry::new(SERVICE, USER)
        .map_err(|_| "无法访问系统凭据库")?
        .get_password()
        .map_err(|_| "未配置 API Key".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn service_identifier_never_contains_secret() {
        assert_eq!(SERVICE, "com.decisionlab.pokertrainer");
        assert!(!USER.contains("secret"));
    }
}
