use crate::storage::ModelSettings;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResult {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRequest {
    pub kind: String,
    pub facts: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationResult {
    pub content: String,
    pub model: String,
    pub elapsed_ms: u64,
}

pub fn normalize_chat_completions_url(base: &str) -> Result<String, String> {
    let trimmed = base.trim().trim_end_matches('/');
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("连接设置无效，训练仍可完全离线".into());
    }
    if trimmed.ends_with("/v1/chat/completions") {
        Ok(trimmed.into())
    } else {
        Ok(format!("{trimmed}/v1/chat/completions"))
    }
}

fn authorization_header(key: Option<String>) -> Option<String> {
    key.map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(|value| format!("Bearer {value}"))
}

fn system_prompt(kind: &str) -> Result<&'static str, String> {
    match kind {
        "live" => Ok(
            "你是中文德州扑克现场教练的解释层。facts 是唯一事实源。\
             不得重新算牌，不得改变推荐动作、尺寸、EV、权益、概率或位置，不得猜测未摊牌底牌。\
             必须只输出一个 JSON 对象，并原样回传 version 和 stateHash。\
             严格输出结构：{\"version\":1,\"stateHash\":\"原值\",\"currentHand\":\"必须原样复制 facts.hero.currentHand\",\"reasoning\":[\"中文字符串\"],\"opponentRead\":[\"中文字符串\"],\"risks\":[\"中文字符串\"],\"recommendationRestatement\":\"必须包含 facts.recommendation.label\"}。\
             reasoning、opponentRead、risks 只能是简短中文字符串数组；禁止额外字段。"
        ),
        "review" => Ok(
            "你是中文德州扑克整手复盘教练的解释层。facts 是唯一事实源。\
             你只负责把本地计算组织成清晰的逐街复盘，不得改变任何数值、推荐、范围或牌局事实，不得猜测未摊牌底牌。\
             目标读者是初中级玩家，必须说人话，但不能删掉关键的范围、价格和行动逻辑。\
             summary 先用两到四句概括整手主线、最大错误或亮点，不要写空泛评分。\
             每个 analysis 必须结合该街行动线，说清：你当时的 heroHand；对手的人物风格和下注如何收窄对手范围；你的动作是否合理；本地推荐是什么以及为什么。\
             每街必须优先采用 decisions 中的 heroHand 作为当前牌型，不得自行重新评牌，不得把同花、顺子、三条等改成高牌或未成牌。privateContribution 为 false 时，要明确说明成牌来自公共牌。\
             每个 analysis 必须原样包含该街 recommended 字段中的最终推荐动作，例如“弃牌”、“跟注”或“加注到……”。\
             若 facts 给了继续所需胜率、权益、对手范围概率或回应概率，必须把它们翻译成决策意义，不能只抄数字。\
             只能把权益与继续所需胜率比较；禁止把“强价值占比”当成你的胜率。如果 facts 没有列出范围中的具体牌型，只能说强价值、中等摊牌价值或诈唬的占比，不得自行举例。\
             analysis 中禁止列举任何更好底牌或自行展开“强价值”的具体牌型，界面会用 betterHandClasses 和 betterHandExamples 单独展示本地精确依据。如果 heroHand 包含“同花”，analysis 不得出现“未成同花”、“没有同花”或“并未击中同花”。\
             heroHand 不包含“听牌”时，不得把它称为“你的听牌”。\
             turningPoint 解释关键转折和当时最容易被误导的地方。keyLesson 写成“下次再遇到……，先……，再……”的可执行规则。\
             不要重复相同结论，不要使用“普通成牌”一类空洞标签，不要用未解释的术语。\
             如果 facts 包含 validationFeedback，说明上一次输出没有通过本地事实审核；必须修正该错误，不得为规避审核而删掉分析。\
             必须只输出一个 JSON 对象，并原样回传 version 和 stateHash。\
             严格输出结构：{\"version\":1,\"stateHash\":\"原值\",\"summary\":\"中文字符串\",\"streets\":[{\"street\":\"原街道\",\"analysis\":\"中文字符串，不能是数组或对象\"}],\"turningPoint\":\"中文字符串\",\"keyLesson\":\"中文字符串\"}。\
             streets 必须与 facts.streets 同顺序、同数量；每个 analysis 必须是单个字符串，禁止数组、嵌套对象和额外字段。"
        ),
        _ => Err("不支持的 AI 解析类型".into()),
    }
}

fn extract_assistant_content(response: &Value) -> Result<String, String> {
    response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| "模型返回内容无效".into())
}

pub fn generate(
    settings: &ModelSettings,
    key: Option<String>,
    input: GenerationRequest,
) -> Result<GenerationResult, String> {
    if !settings.enabled {
        return Err("AI 解析未启用".into());
    }
    let model = settings.model.trim();
    if model.is_empty() {
        return Err("连接设置无效".into());
    }
    let url = normalize_chat_completions_url(&settings.base_url)?;
    let prompt = system_prompt(&input.kind)?;
    let max_tokens = if input.kind == "review" { 2600 } else { 500 };
    let timeout = if input.kind == "review" {
        Duration::from_secs(45)
    } else {
        Duration::from_secs(4)
    };
    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": input.facts.to_string()}
        ],
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"}
    });
    let mut request = ureq::post(&url);
    if let Some(value) = authorization_header(key) {
        request = request.set("Authorization", &value);
    }
    let started = Instant::now();
    let response = request
        .timeout(timeout)
        .send_json(body)
        .map_err(|_| "AI 解析请求失败".to_string())?;
    let value: Value = response
        .into_json()
        .map_err(|_| "模型返回格式无效".to_string())?;
    Ok(GenerationResult {
        content: extract_assistant_content(&value)?,
        model: model.to_owned(),
        elapsed_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
    })
}

pub fn test_connection(
    base: &str,
    model: &str,
    key: Option<String>,
) -> Result<ConnectionResult, String> {
    let base = base.trim();
    let model = model.trim();
    if model.is_empty() {
        return Err("连接设置无效，训练仍可完全离线".into());
    }

    let url = normalize_chat_completions_url(base)?;
    let body = json!({
        "model": model,
        "messages": [{"role": "user", "content": "只回复 OK"}],
        "max_tokens": 4
    });
    let mut request = ureq::post(&url);
    if let Some(value) = authorization_header(key) {
        request = request.set("Authorization", &value);
    }
    let response = request
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
    fn normalizes_root_and_complete_chat_completion_urls() {
        assert_eq!(
            normalize_chat_completions_url("http://192.168.120.86:8081").unwrap(),
            "http://192.168.120.86:8081/v1/chat/completions"
        );
        assert_eq!(
            normalize_chat_completions_url(
                "http://192.168.120.86:8081/v1/chat/completions/"
            )
            .unwrap(),
            "http://192.168.120.86:8081/v1/chat/completions"
        );
    }

    #[test]
    fn accepts_missing_key_for_unsecured_local_models() {
        assert_eq!(authorization_header(None), None);
        assert_eq!(authorization_header(Some("  ".into())), None);
        assert_eq!(
            authorization_header(Some("local-secret".into())),
            Some("Bearer local-secret".into())
        );
    }

    #[test]
    fn rejects_non_http_model_urls() {
        assert_eq!(
            normalize_chat_completions_url("file:///tmp/model").unwrap_err(),
            "连接设置无效，训练仍可完全离线"
        );
    }

    #[test]
    fn extracts_only_assistant_content_from_openai_response() {
        let response = json!({
            "choices": [{"message": {"role": "assistant", "content": "{\"version\":1}"}}],
            "usage": {"total_tokens": 42}
        });
        assert_eq!(extract_assistant_content(&response).unwrap(), "{\"version\":1}");
        assert!(extract_assistant_content(&json!({"choices": []})).is_err());
    }

    #[test]
    fn uses_distinct_guarded_prompts_for_live_and_review_requests() {
        let live = system_prompt("live").unwrap();
        let review = system_prompt("review").unwrap();
        assert!(live.contains("不得改变推荐动作"));
        assert!(review.contains("逐街复盘"));
        assert!(review.contains("行动线"));
        assert!(review.contains("对手范围"));
        assert!(review.contains("为什么"));
        assert!(review.contains("下次再遇到"));
        assert_ne!(live, review);
        assert!(system_prompt("opponent-action").is_err());
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
