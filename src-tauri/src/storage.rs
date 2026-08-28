use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("数据库操作失败")]
    Database(#[from] rusqlite::Error),
    #[error("牌局数据格式无效")]
    Json(#[from] serde_json::Error),
    #[error("牌局数据缺少 {0}")]
    Missing(&'static str),
    #[error("导入文件格式无效")]
    InvalidDocument,
    #[error("牌局包含无效或重复牌张")]
    InvalidCards,
    #[error("牌局数据包含不允许的敏感字段")]
    SensitiveData,
    #[error("玩法设置无效")]
    InvalidGameplay,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSettings {
    pub base_url: String,
    pub model: String,
}

impl Default for ModelSettings {
    fn default() -> Self {
        Self {
            base_url: "http://127.0.0.1:8317".into(),
            model: "gpt-local".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameplaySettings {
    pub table_profile_id: String,
    #[serde(default = "default_table_theme_id")]
    pub table_theme_id: String,
    #[serde(default = "default_teaching_panel_width")]
    pub teaching_panel_width: u16,
    #[serde(default = "default_player_profiles")]
    pub player_profiles: Vec<PlayerProfile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerProfile {
    pub version: u8,
    pub player_id: String,
    pub display_name: String,
    pub archetype: String,
    pub looseness: u8,
    pub aggression: u8,
    pub bluff: u8,
}

fn profile(id: &str, name: &str, archetype: &str, looseness: u8, aggression: u8, bluff: u8) -> PlayerProfile {
    PlayerProfile {
        version: 1,
        player_id: id.into(),
        display_name: name.into(),
        archetype: archetype.into(),
        looseness,
        aggression,
        bluff,
    }
}

fn default_player_profiles() -> Vec<PlayerProfile> {
    vec![
        profile("friend-01", "阿岚", "loose-aggressive", 86, 88, 66),
        profile("friend-02", "北辰", "balanced", 50, 58, 35),
        profile("friend-03", "墨川", "balanced", 42, 52, 28),
        profile("friend-04", "青禾", "balanced", 55, 64, 42),
        profile("friend-05", "老周", "tight-passive", 36, 32, 15),
        profile("friend-06", "小满", "tight-passive", 32, 28, 12),
    ]
}

fn default_table_theme_id() -> String {
    "classic-green".into()
}

fn default_teaching_panel_width() -> u16 {
    350
}

impl Default for GameplaySettings {
    fn default() -> Self {
        Self {
            table_profile_id: "balanced".into(),
            table_theme_id: default_table_theme_id(),
            teaching_panel_width: default_teaching_panel_width(),
            player_profiles: default_player_profiles(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported: usize,
    pub skipped: usize,
}

pub fn migrate(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS hands(
           id INTEGER PRIMARY KEY,
           hand_key TEXT,
           created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
           seed INTEGER NOT NULL,
           snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
           score REAL,
           tags TEXT NOT NULL DEFAULT '[]'
         );
         CREATE TABLE IF NOT EXISTS settings(
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS decision_assessments(
           hand_key TEXT NOT NULL,
           assessment_id TEXT NOT NULL,
           street TEXT NOT NULL,
           severity TEXT NOT NULL,
           normalized_ev_loss REAL NOT NULL,
           tags TEXT NOT NULL CHECK(json_valid(tags)),
           snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
           UNIQUE(hand_key, assessment_id)
         );",
    )?;
    let has_hand_key = {
        let mut statement = c.prepare("PRAGMA table_info(hands)")?;
        let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
        let mut found = false;
        for column in columns {
            if column? == "hand_key" {
                found = true;
            }
        }
        found
    };
    if !has_hand_key {
        c.execute("ALTER TABLE hands ADD COLUMN hand_key TEXT", [])?;
    }
    c.execute(
        "UPDATE hands
         SET hand_key = CAST(seed AS TEXT) || ':' || COALESCE(json_extract(snapshot, '$.handNo'), 1)
         WHERE hand_key IS NULL",
        [],
    )?;
    c.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_hands_hand_key ON hands(hand_key)",
        [],
    )?;
    c.pragma_update(None, "user_version", 3)?;
    Ok(())
}

fn hand_identity(value: &Value) -> Result<(i64, i64, String), StorageError> {
    let seed = value
        .get("seed")
        .and_then(Value::as_i64)
        .ok_or(StorageError::Missing("seed"))?;
    let hand_no = value
        .get("handNo")
        .and_then(Value::as_i64)
        .ok_or(StorageError::Missing("handNo"))?;
    Ok((seed, hand_no, format!("{seed}:{hand_no}")))
}

fn contains_sensitive_key(value: &Value) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, value)| {
            let normalized = key.to_ascii_lowercase().replace('-', "_");
            matches!(normalized.as_str(), "api_key" | "apikey" | "authorization" | "credential" | "credentials")
                || contains_sensitive_key(value)
        }),
        Value::Array(values) => values.iter().any(contains_sensitive_key),
        _ => false,
    }
}

fn collect_cards(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                if matches!(key.as_str(), "hole" | "board" | "burn" | "deck") {
                    if let Value::Array(cards) = child {
                        out.extend(cards.iter().filter_map(Value::as_str).map(str::to_owned));
                    }
                } else {
                    collect_cards(child, out);
                }
            }
        }
        Value::Array(values) => values.iter().for_each(|child| collect_cards(child, out)),
        _ => {}
    }
}

fn validate_hand(value: &Value) -> Result<(), StorageError> {
    hand_identity(value)?;
    let version = value.get("version").and_then(Value::as_i64);
    if version != Some(7) || !value.get("log").is_some_and(Value::is_array) {
        return Err(StorageError::InvalidDocument);
    }
    if !value.get("policyDecisions").is_some_and(Value::is_array) {
        return Err(StorageError::InvalidDocument);
    }
    if !value.get("strategyDecisions").is_some_and(Value::is_array)
        || !value.get("strategyVersion").is_some_and(Value::is_string)
    {
        return Err(StorageError::InvalidDocument);
    }
    if contains_sensitive_key(value) {
        return Err(StorageError::SensitiveData);
    }
    {
        let profile = value.get("tableProfileId").and_then(Value::as_str);
        if !matches!(profile, Some("balanced" | "friends" | "loose-wild"))
            || !value.get("assessments").is_some_and(Value::is_array)
        {
            return Err(StorageError::InvalidDocument);
        }
        for assessment in value["assessments"].as_array().unwrap() {
            if !assessment.get("id").is_some_and(Value::is_string)
                || !assessment.get("street").is_some_and(Value::is_string)
                || !assessment.get("severity").is_some_and(Value::is_string)
                || !assessment.get("normalizedEvLoss").is_some_and(Value::is_number)
                || !assessment.get("tags").is_some_and(Value::is_array)
                || !assessment.get("scored").is_some_and(Value::is_boolean)
            {
                return Err(StorageError::InvalidDocument);
            }
        }
    }
    {
        let profiles: Vec<PlayerProfile> = serde_json::from_value(
            value.get("playerProfiles").cloned().ok_or(StorageError::InvalidDocument)?,
        )
        .map_err(|_| StorageError::InvalidDocument)?;
        validate_player_profiles(&profiles)?;
        if !value.get("friendBankrolls").is_some_and(Value::is_array) {
            return Err(StorageError::InvalidDocument);
        }
    }
    let mut cards = Vec::new();
    collect_cards(value, &mut cards);
    let mut unique = HashSet::new();
    for card in cards {
        let bytes = card.as_bytes();
        if bytes.len() != 2
            || !b"23456789TJQKA".contains(&bytes[0])
            || !b"cdhs".contains(&bytes[1])
            || !unique.insert(card)
        {
            return Err(StorageError::InvalidCards);
        }
    }
    Ok(())
}

fn migrate_hand_to_v7(value: &Value) -> Result<Value, StorageError> {
    let mut migrated = value.clone();
    match migrated.get("version").and_then(Value::as_i64) {
        Some(6) => {
            let object = migrated.as_object_mut().ok_or(StorageError::InvalidDocument)?;
            object.insert("version".into(), Value::from(7));
            object.insert("strategyVersion".into(), Value::from("legacy-v6"));
            object.insert("strategyDecisions".into(), Value::Array(Vec::new()));
            if let Some(assessments) = object.get_mut("assessments").and_then(Value::as_array_mut) {
                for assessment in assessments {
                    if let Some(item) = assessment.as_object_mut() {
                        item.entry("scored").or_insert(Value::Bool(false));
                    }
                }
            }
        }
        Some(7) => {}
        _ => return Err(StorageError::InvalidDocument),
    }
    validate_hand(&migrated)?;
    Ok(migrated)
}

fn insert_hand(c: &Connection, value: &Value, snapshot: &str) -> Result<bool, StorageError> {
    let (seed, _, hand_key) = hand_identity(&value)?;
    let changed = c.execute(
        "INSERT OR IGNORE INTO hands(hand_key,seed,snapshot) VALUES(?1,?2,?3)",
        params![&hand_key, seed, snapshot],
    )?;
    if changed == 1 {
        if let Some(assessments) = value.get("assessments").and_then(Value::as_array) {
            for assessment in assessments {
                c.execute(
                    "INSERT INTO decision_assessments(
                       hand_key,assessment_id,street,severity,normalized_ev_loss,tags,snapshot
                     ) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                    params![
                        &hand_key,
                        assessment["id"].as_str().unwrap(),
                        assessment["street"].as_str().unwrap(),
                        assessment["severity"].as_str().unwrap(),
                        assessment["normalizedEvLoss"].as_f64().unwrap(),
                        serde_json::to_string(&assessment["tags"])?,
                        serde_json::to_string(assessment)?,
                    ],
                )?;
            }
        }
    }
    Ok(changed == 1)
}

pub fn save(c: &Connection, snapshot: &str) -> Result<bool, StorageError> {
    let value: Value = serde_json::from_str(snapshot)?;
    let value = migrate_hand_to_v7(&value)?;
    let snapshot = serde_json::to_string(&value)?;
    let transaction = c.unchecked_transaction()?;
    let changed = insert_hand(&transaction, &value, &snapshot)?;
    transaction.commit()?;
    Ok(changed)
}

pub fn list(c: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut statement = c.prepare("SELECT snapshot FROM hands ORDER BY id DESC")?;
    let rows = statement.query_map([], |row| row.get(0))?;
    rows.collect()
}

pub fn clear(c: &Connection) -> rusqlite::Result<()> {
    let transaction = c.unchecked_transaction()?;
    transaction.execute("DELETE FROM decision_assessments", [])?;
    transaction.execute("DELETE FROM hands", [])?;
    transaction.commit()?;
    Ok(())
}

pub fn save_model_settings(c: &Connection, settings: &ModelSettings) -> Result<(), StorageError> {
    let encoded = serde_json::to_string(settings)?;
    c.execute(
        "INSERT INTO settings(key,value) VALUES('model',?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![encoded],
    )?;
    Ok(())
}

pub fn load_model_settings(c: &Connection) -> Result<ModelSettings, StorageError> {
    let value = c.query_row("SELECT value FROM settings WHERE key='model'", [], |row| {
        row.get::<_, String>(0)
    });
    match value {
        Ok(encoded) => Ok(serde_json::from_str(&encoded)?),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(ModelSettings::default()),
        Err(error) => Err(error.into()),
    }
}

fn validate_gameplay_settings(settings: &GameplaySettings) -> Result<(), StorageError> {
    let valid_profile = matches!(
        settings.table_profile_id.as_str(),
        "balanced" | "friends" | "loose-wild"
    );
    let valid_theme = matches!(
        settings.table_theme_id.as_str(),
        "classic-green" | "midnight-blue" | "wine-red" | "graphite-black"
    );
    if valid_profile
        && valid_theme
        && (300..=520).contains(&settings.teaching_panel_width)
        && validate_player_profiles(&settings.player_profiles).is_ok()
    {
        Ok(())
    } else {
        Err(StorageError::InvalidGameplay)
    }
}

fn validate_player_profiles(profiles: &[PlayerProfile]) -> Result<(), StorageError> {
    const IDS: [&str; 6] = [
        "friend-01",
        "friend-02",
        "friend-03",
        "friend-04",
        "friend-05",
        "friend-06",
    ];
    const ARCHETYPES: [&str; 6] = [
        "loose-aggressive",
        "loose-passive",
        "tight-aggressive",
        "tight-passive",
        "balanced",
        "recreational",
    ];
    if profiles.len() != 6 {
        return Err(StorageError::InvalidGameplay);
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    for profile in profiles {
        let name = profile.display_name.trim();
        if profile.version != 1
            || !IDS.contains(&profile.player_id.as_str())
            || !ids.insert(profile.player_id.as_str())
            || name.is_empty()
            || name == "你"
            || name.chars().count() > 12
            || !names.insert(name)
            || !ARCHETYPES.contains(&profile.archetype.as_str())
            || profile.looseness > 100
            || profile.aggression > 100
            || profile.bluff > 100
        {
            return Err(StorageError::InvalidGameplay);
        }
    }
    Ok(())
}

pub fn save_gameplay_settings(
    c: &Connection,
    settings: &GameplaySettings,
) -> Result<(), StorageError> {
    validate_gameplay_settings(settings)?;
    let encoded = serde_json::to_string(settings)?;
    c.execute(
        "INSERT INTO settings(key,value) VALUES('gameplay',?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![encoded],
    )?;
    Ok(())
}

pub fn load_gameplay_settings(c: &Connection) -> Result<GameplaySettings, StorageError> {
    let value = c.query_row("SELECT value FROM settings WHERE key='gameplay'", [], |row| {
        row.get::<_, String>(0)
    });
    match value {
        Ok(encoded) => {
            let settings: GameplaySettings = serde_json::from_str(&encoded)?;
            validate_gameplay_settings(&settings)?;
            Ok(settings)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(GameplaySettings::default()),
        Err(error) => Err(error.into()),
    }
}

pub fn export_document(c: &Connection, exported_at: &str) -> Result<String, StorageError> {
    let hands: Vec<Value> = list(c)?
        .iter()
        .map(|snapshot| {
            let value: Value = serde_json::from_str(snapshot)?;
            migrate_hand_to_v7(&value)
        })
        .collect::<Result<_, _>>()?;
    if hands.iter().any(contains_sensitive_key) {
        return Err(StorageError::SensitiveData);
    }
    let gameplay_settings = load_gameplay_settings(c)?;
    Ok(serde_json::to_string_pretty(&serde_json::json!({
        "format": "poker-decision-trainer",
        "version": 7,
        "exportedAt": exported_at,
        "gameplaySettings": gameplay_settings,
        "hands": hands
    }))?)
}

pub fn import_document(c: &mut Connection, document: &str) -> Result<ImportSummary, StorageError> {
    let root: Value = serde_json::from_str(document)?;
    let version = root.get("version").and_then(Value::as_i64);
    if root.get("format").and_then(Value::as_str) != Some("poker-decision-trainer")
        || !matches!(version, Some(6 | 7))
        || contains_sensitive_key(&root)
    {
        return Err(StorageError::InvalidDocument);
    }
    let raw_hands = root
        .get("hands")
        .and_then(Value::as_array)
        .ok_or(StorageError::InvalidDocument)?;
    let hands: Vec<Value> = raw_hands
        .iter()
        .map(migrate_hand_to_v7)
        .collect::<Result<_, _>>()?;
    let gameplay_settings = {
        let settings: GameplaySettings = serde_json::from_value(
            root.get("gameplaySettings")
                .cloned()
                .ok_or(StorageError::InvalidDocument)?,
        )
        .map_err(|_| StorageError::InvalidDocument)?;
        validate_gameplay_settings(&settings)?;
        Some(settings)
    };

    let transaction = c.transaction()?;
    let mut imported = 0;
    let mut skipped = 0;
    for hand in &hands {
        let snapshot = serde_json::to_string(hand)?;
        if insert_hand(&transaction, hand, &snapshot)? {
            imported += 1;
        } else {
            skipped += 1;
        }
    }
    if let Some(settings) = gameplay_settings {
        save_gameplay_settings(&transaction, &settings)?;
    }
    transaction.commit()?;
    Ok(ImportSummary { imported, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_only_the_new_player_identity_generation() {
        let profiles = default_player_profiles();
        assert_eq!(profiles[0].player_id, "friend-01");
        assert_eq!(profiles[0].display_name, "阿岚");
        assert_eq!(profiles[5].player_id, "friend-06");
        assert_eq!(profiles[5].display_name, "小满");
        assert!(validate_hand(&serde_json::json!({
            "version": 5,
            "seed": 1,
            "handNo": 1,
            "log": []
        })).is_err());
    }

    fn hand(seed: i64, hand_no: i64) -> String {
        serde_json::json!({
            "version": 7,
            "strategyVersion": "legacy-adapter-v1",
            "seed": seed,
            "handNo": hand_no,
            "players": [],
            "playerProfiles": default_player_profiles(),
            "friendBankrolls": [],
            "board": [],
            "burn": [],
            "deck": [],
            "log": [],
            "policyDecisions": [],
            "strategyDecisions": [],
            "tableProfileId": "friends",
            "trainingTarget": { "mode": "none" },
            "assessmentStatus": "ready",
            "assessments": [{
                "id": format!("{hand_no}:0"),
                "street": "preflop",
                "severity": "review",
                "normalizedEvLoss": 0.08,
                "tags": ["overcalling"],
                "scored": true
            }],
            "result": { "reason": "fold", "winners": [0], "summary": "test" }
        })
        .to_string()
    }

    #[test]
    fn migrates_to_v3_and_indexes_assessments_idempotently() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let version: i64 = c
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 3);
        assert!(save(&c, &hand(7, 1)).unwrap());
        assert!(!save(&c, &hand(7, 1)).unwrap());
        assert_eq!(list(&c).unwrap().len(), 1);
        let assessments: i64 = c
            .query_row("SELECT COUNT(*) FROM decision_assessments", [], |row| row.get(0))
            .unwrap();
        assert_eq!(assessments, 1);

        let malformed = hand(8, 1).replace(r#""id":"1:0","#, "");
        assert!(save(&c, &malformed).is_err());
        assert_eq!(list(&c).unwrap().len(), 1);
    }

    #[test]
    fn clearing_hands_preserves_model_and_gameplay_settings() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let expected = ModelSettings {
            base_url: "http://127.0.0.1:8317".into(),
            model: "gpt-local".into(),
        };
        save_model_settings(&c, &expected).unwrap();
        let gameplay = GameplaySettings {
            table_profile_id: "loose-wild".into(),
            table_theme_id: "wine-red".into(),
            teaching_panel_width: 480,
            player_profiles: default_player_profiles(),
        };
        save_gameplay_settings(&c, &gameplay).unwrap();
        save(&c, &hand(9, 1)).unwrap();
        clear(&c).unwrap();
        assert!(list(&c).unwrap().is_empty());
        assert_eq!(load_model_settings(&c).unwrap(), expected);
        assert_eq!(load_gameplay_settings(&c).unwrap(), gameplay);
        let assessments: i64 = c
            .query_row("SELECT COUNT(*) FROM decision_assessments", [], |row| row.get(0))
            .unwrap();
        assert_eq!(assessments, 0);

        let invalid = GameplaySettings {
            table_profile_id: "unknown".into(),
            table_theme_id: "classic-green".into(),
            teaching_panel_width: 350,
            player_profiles: default_player_profiles(),
        };
        assert_eq!(
            save_gameplay_settings(&c, &invalid).unwrap_err().to_string(),
            "玩法设置无效"
        );

        c.execute(
            "INSERT INTO settings(key,value) VALUES('gameplay',?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [r#"{"tableProfileId":"friends"}"#],
        )
        .unwrap();
        assert_eq!(
            load_gameplay_settings(&c).unwrap(),
            GameplaySettings {
                table_profile_id: "friends".into(),
                table_theme_id: "classic-green".into(),
                teaching_panel_width: 350,
                player_profiles: default_player_profiles(),
            }
        );

        for invalid in [
            GameplaySettings {
                table_profile_id: "balanced".into(),
                table_theme_id: "neon".into(),
                teaching_panel_width: 350,
                player_profiles: default_player_profiles(),
            },
            GameplaySettings {
                table_profile_id: "balanced".into(),
                table_theme_id: "classic-green".into(),
                teaching_panel_width: 900,
                player_profiles: default_player_profiles(),
            },
        ] {
            assert_eq!(
                save_gameplay_settings(&c, &invalid).unwrap_err().to_string(),
                "玩法设置无效"
            );
        }
    }

    fn document(hands: &[String]) -> String {
        let values: Vec<Value> = hands
            .iter()
            .map(|value| serde_json::from_str(value).unwrap())
            .collect();
        serde_json::json!({
            "format": "poker-decision-trainer",
            "version": 7,
            "exportedAt": "2026-08-19T00:00:00Z",
            "gameplaySettings": GameplaySettings::default(),
            "hands": values
        })
        .to_string()
    }

    #[test]
    fn imports_atomically_and_skips_duplicates() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        save(&c, &hand(1, 1)).unwrap();
        let summary = import_document(&mut c, &document(&[hand(1, 1), hand(2, 1)])).unwrap();
        assert_eq!(
            summary,
            ImportSummary {
                imported: 1,
                skipped: 1
            }
        );
        assert_eq!(list(&c).unwrap().len(), 2);
        let assessments: i64 = c
            .query_row("SELECT COUNT(*) FROM decision_assessments", [], |row| row.get(0))
            .unwrap();
        assert_eq!(assessments, 2);

        let invalid = r#"{"version":3,"seed":3,"handNo":1,"players":[{"hole":["Ah","Ah"]}],"board":[],"burn":[],"deck":[],"log":[],"policyDecisions":[],"result":{"reason":"fold","winners":[0],"summary":"test"}}"#;
        let before = list(&c).unwrap().len();
        assert!(import_document(&mut c, &document(&[hand(4, 1), invalid.into()])).is_err());
        assert_eq!(list(&c).unwrap().len(), before);
    }

    #[test]
    fn imports_v6_hands_as_unscored_v7_history() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let mut legacy: Value = serde_json::from_str(&hand(15, 1)).unwrap();
        legacy["version"] = Value::from(6);
        legacy.as_object_mut().unwrap().remove("strategyVersion");
        legacy.as_object_mut().unwrap().remove("strategyDecisions");
        legacy["assessments"][0].as_object_mut().unwrap().remove("scored");
        let mut legacy_document: Value = serde_json::from_str(&document(&[legacy.to_string()])).unwrap();
        legacy_document["version"] = Value::from(6);

        import_document(&mut c, &legacy_document.to_string()).unwrap();
        let restored: Value = serde_json::from_str(&list(&c).unwrap()[0]).unwrap();
        assert_eq!(restored["version"], Value::from(7));
        assert_eq!(restored["strategyVersion"], Value::from("legacy-v6"));
        assert_eq!(restored["strategyDecisions"], Value::Array(Vec::new()));
        assert_eq!(restored["assessments"][0]["scored"], Value::Bool(false));
    }

    #[test]
    fn rejects_snapshots_from_prior_data_generations() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        for version in 1..=5 {
            let mut incompatible: Value = serde_json::from_str(&hand(20 + version, 1)).unwrap();
            incompatible["version"] = version.into();
            assert!(import_document(&mut c, &document(&[incompatible.to_string()])).is_err());
        }
        assert!(list(&c).unwrap().is_empty());
    }

    #[test]
    fn defaults_missing_gameplay_profiles_to_the_new_six_profiles() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        c.execute(
            "INSERT INTO settings(key,value) VALUES('gameplay',?1)",
            [r#"{"tableProfileId":"friends","tableThemeId":"midnight-blue","teachingPanelWidth":400}"#],
        )
        .unwrap();
        let settings = load_gameplay_settings(&c).unwrap();
        assert_eq!(settings.player_profiles, default_player_profiles());
    }

    #[test]
    fn v7_export_import_round_trips_profiles_atomically_without_secrets() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let mut settings = GameplaySettings::default();
        settings.player_profiles[0].display_name = "岚风".into();
        save_gameplay_settings(&c, &settings).unwrap();
        save(&c, &hand(61, 1)).unwrap();
        let exported = export_document(&c, "2026-08-21T00:00:00Z").unwrap();
        assert!(exported.contains(r#""version": 7"#));
        assert!(!exported.to_lowercase().contains("credential"));

        let mut restored = Connection::open_in_memory().unwrap();
        migrate(&restored).unwrap();
        import_document(&mut restored, &exported).unwrap();
        assert_eq!(load_gameplay_settings(&restored).unwrap(), settings);

        let mut invalid: Value = serde_json::from_str(&exported).unwrap();
        invalid["gameplaySettings"]["playerProfiles"][1]["displayName"] = "岚风".into();
        let before = list(&restored).unwrap().len();
        assert!(import_document(&mut restored, &invalid.to_string()).is_err());
        assert_eq!(list(&restored).unwrap().len(), before);
        assert_eq!(load_gameplay_settings(&restored).unwrap(), settings);
    }

    #[test]
    fn exports_clears_and_restores_v7_training_facts_exactly() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let original: Value = serde_json::from_str(&hand(31, 7)).unwrap();
        save(&c, &original.to_string()).unwrap();

        let exported = export_document(&c, "2026-08-19T11:30:00Z").unwrap();
        let sentinel = ["SENTINEL-NATIVE-", "API-KEY"].concat();
        assert!(!exported.contains(&sentinel));
        clear(&c).unwrap();
        assert!(list(&c).unwrap().is_empty());

        let summary = import_document(&mut c, &exported).unwrap();
        assert_eq!(summary, ImportSummary { imported: 1, skipped: 0 });
        let restored: Value = serde_json::from_str(&list(&c).unwrap()[0]).unwrap();
        for field in [
            "seed",
            "handNo",
            "tableProfileId",
            "trainingTarget",
            "assessments",
            "log",
            "result",
        ] {
            assert_eq!(restored.get(field), original.get(field), "field {field}");
        }
        let indexed: i64 = c
            .query_row("SELECT COUNT(*) FROM decision_assessments", [], |row| row.get(0))
            .unwrap();
        assert_eq!(indexed, 1);
    }

    #[test]
    fn rejects_bad_documents_and_exports_without_secrets() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        assert!(import_document(&mut c, r#"{"format":"wrong","version":1,"hands":[]}"#).is_err());
        assert!(import_document(
            &mut c,
            r#"{"format":"poker-decision-trainer","version":2,"hands":[]}"#,
        )
        .is_err());
        assert!(import_document(&mut c, &document(&[r#"{"handNo":1}"#.into()])).is_err());

        save(&c, &hand(7, 1)).unwrap();
        let exported = export_document(&c, "2026-08-19T00:00:00Z").unwrap();
        let lower = exported.to_lowercase();
        assert!(exported.contains("\"exportedAt\": \"2026-08-19T00:00:00Z\""));
        assert!(!lower.contains("api_key"));
        assert!(!lower.contains("authorization"));
        let secret = ["SENTINEL-DESKTOP-", "SECRET"].concat();
        assert!(!exported.contains(&secret));
    }
}
