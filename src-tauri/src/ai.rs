use serde::Serialize;
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResult {
    pub ok: bool,
    pub message: String,
}

pub fn test_connection(
    base: &str,
    model: &str,
    key: Option<String>,
) -> Result<ConnectionResult, String> {
    let key = key.ok_or("未配置 API Key，训练仍可完全离线")?;
    let base = base.trim();
    let model = model.trim();
    if !(base.starts_with("http://") || base.starts_with("https://")) || model.is_empty() {
        return Err("连接设置无效，训练仍可完全离线".into());
    }

    let url = format!("{}/v1/chat/completions", base.trim_end_matches('/'));
    let body = json!({
        "model": model,
        "messages": [{"role": "user", "content": "只回复 OK"}],
        "max_tokens": 4
    });
    let response = ureq::post(&url)
        .set("Authorization", &format!("Bearer {key}"))
        .timeout(std::time::Duration::from_secs(8))
        .send_json(body)
        .map_err(|_| "连接失败，训练仍可完全离线")?;

    if response.status() == 200 {
        Ok(ConnectionResult {
            ok: true,
            message: "连接成功；模型仅用于解释，本地规则优先".into(),
        })
    } else {
        Err("连接失败，训练仍可完全离线".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_secret() -> String {
        ["SENTINEL-DESKTOP-", "SECRET"].concat()
    }

    #[test]
    fn missing_key_degrades_offline() {
        let error = test_connection("http://127.0.0.1:1", "x", None).unwrap_err();
        assert_eq!(error, "未配置 API Key，训练仍可完全离线");
    }

    #[test]
    fn invalid_settings_never_attempt_a_request() {
        assert_eq!(
            test_connection(
                "file:///tmp/model",
                "x",
                Some(test_secret())
            )
            .unwrap_err(),
            "连接设置无效，训练仍可完全离线"
        );
        assert_eq!(
            test_connection(
                "http://127.0.0.1:8317",
                " ",
                Some(test_secret())
            )
            .unwrap_err(),
            "连接设置无效，训练仍可完全离线"
        );
    }
}
