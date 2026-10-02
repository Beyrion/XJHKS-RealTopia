mod prompt;

#[cfg(mobile)]
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::Manager;

const WORLD_FILE: &str = "topia-world-v1.json";
const MOCK_WORLD: &str = include_str!("mock_world.json");

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TopiaLocation {
    Exterior,
    Interior,
    Garden,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TopiaPrefab {
    FloatingIsland,
    Block,
    Cone,
    Cylinder,
    Door,
    RoundWindow,
    Tower,
    Sail,
    WindChimes,
    Observatory,
    Crystal,
    Cloud,
    RoomShell,
    SkyWindow,
    Bed,
    Nightstand,
    Desk,
    Chair,
    Shelf,
    Plant,
    Hearth,
    Rug,
    Lantern,
    Propeller,
    Path,
    CropPlot,
    FarmShed,
    WateringOrb,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaWorldProfile {
    home_name: String,
    archetype: String,
    traits: Vec<String>,
    experiences: Vec<String>,
    accent_colors: [u32; 3],
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaUserProfileInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
    summary: String,
    traits: Vec<String>,
    experiences: Vec<String>,
    preferences: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaObjectConfig {
    id: String,
    prefab: TopiaPrefab,
    position: [f64; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rotation: Option<[f64; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scale: Option<[f64; 3]>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    colors: Vec<u32>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    params: HashMap<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    anchor_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    animation: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaPlacement {
    left: String,
    top: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaLandmark {
    id: String,
    anchor_id: String,
    location: TopiaLocation,
    emoji: String,
    label: String,
    eyebrow: String,
    description: String,
    fallback_placement: TopiaPlacement,
    #[serde(default)]
    memory_ids: Vec<String>,
    #[serde(default)]
    task_ids: Vec<String>,
    #[serde(default)]
    person_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TopiaCamera {
    yaw: f64,
    pitch: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TopiaSceneConfig {
    camera: TopiaCamera,
    objects: Vec<TopiaObjectConfig>,
    landmarks: Vec<TopiaLandmark>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TopiaScenes {
    exterior: TopiaSceneConfig,
    interior: TopiaSceneConfig,
    garden: TopiaSceneConfig,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaGenerationMetadata {
    provider: String,
    model: String,
    prompt_version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaWorldConfig {
    schema_version: u8,
    id: String,
    owner_id: String,
    revision: u64,
    generated_at: String,
    source: String,
    profile: TopiaWorldProfile,
    scenes: TopiaScenes,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    generation: Option<TopiaGenerationMetadata>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaQuestContext {
    id: String,
    title: String,
    progress: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    person_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    priority: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reward: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaPersonContext {
    id: String,
    name: String,
    role: String,
    affinity: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaMemoryContext {
    id: String,
    title: String,
    meta: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    person_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    task_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mood: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    intensity: Option<u8>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaRuntimeContext {
    #[serde(default)]
    quests: Vec<TopiaQuestContext>,
    #[serde(default)]
    people: Vec<TopiaPersonContext>,
    #[serde(default)]
    memories: Vec<TopiaMemoryContext>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaGenerationInput {
    profile: TopiaUserProfileInput,
    context: TopiaRuntimeContext,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaSceneCrop {
    id: String,
    title: String,
    progress: u8,
    crop: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    person_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopiaWorldPayload {
    world: TopiaWorldConfig,
    crops: Vec<TopiaSceneCrop>,
}

fn scene_mut(world: &mut TopiaWorldConfig, location: TopiaLocation) -> &mut TopiaSceneConfig {
    match location {
        TopiaLocation::Exterior => &mut world.scenes.exterior,
        TopiaLocation::Interior => &mut world.scenes.interior,
        TopiaLocation::Garden => &mut world.scenes.garden,
    }
}

fn valid_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}

fn valid_vector(value: &[f64; 3], min: f64, max: f64) -> bool {
    value
        .iter()
        .all(|component| component.is_finite() && *component >= min && *component <= max)
}

fn valid_percentage(value: &str) -> bool {
    value
        .strip_suffix('%')
        .and_then(|number| number.parse::<f64>().ok())
        .is_some_and(|number| number.is_finite() && (0.0..=100.0).contains(&number))
}

fn validate_scene(scene: &TopiaSceneConfig, location: TopiaLocation) -> Result<(), String> {
    if !(8..=40).contains(&scene.objects.len()) {
        return Err(format!("{location:?} must contain 8..40 objects"));
    }
    if scene.landmarks.len() > 8 {
        return Err(format!("{location:?} contains too many landmarks"));
    }
    if !scene.camera.yaw.is_finite()
        || !(-3.2..=3.2).contains(&scene.camera.yaw)
        || !scene.camera.pitch.is_finite()
        || !(0.18..=1.08).contains(&scene.camera.pitch)
    {
        return Err(format!("{location:?} camera is out of range"));
    }
    let mut object_ids = HashSet::new();
    let mut anchors = HashSet::new();
    for object in &scene.objects {
        if !valid_text(&object.id, 64) || !object_ids.insert(object.id.as_str()) {
            return Err(format!(
                "{location:?} has an invalid or duplicate object id"
            ));
        }
        if !valid_vector(&object.position, -8.0, 8.0)
            || object.rotation.as_ref().is_some_and(|value| {
                !valid_vector(value, -std::f64::consts::TAU, std::f64::consts::TAU)
            })
            || object
                .scale
                .as_ref()
                .is_some_and(|value| !valid_vector(value, 0.1, 4.0))
        {
            return Err(format!("{} has an invalid transform", object.id));
        }
        if object.colors.len() > 8 || object.colors.iter().any(|color| *color > 0x00ff_ffff) {
            return Err(format!("{} has invalid colors", object.id));
        }
        if object.params.len() > 16
            || object.params.iter().any(|(key, value)| {
                !valid_text(key, 40)
                    || match value {
                        Value::Bool(_) => false,
                        Value::String(value) => value.chars().count() > 64,
                        Value::Number(value) => value
                            .as_f64()
                            .is_none_or(|number| !number.is_finite() || number.abs() > 20.0),
                        _ => true,
                    }
            })
        {
            return Err(format!("{} has invalid prefab parameters", object.id));
        }
        if object
            .animation
            .as_deref()
            .is_some_and(|value| !matches!(value, "float" | "spin" | "sway"))
        {
            return Err(format!("{} has an invalid animation", object.id));
        }
        if let Some(anchor) = &object.anchor_id {
            if !valid_text(anchor, 64) || !anchors.insert(anchor.as_str()) {
                return Err(format!("{location:?} has an invalid or duplicate anchor"));
            }
        }
    }
    let mut landmark_ids = HashSet::new();
    for landmark in &scene.landmarks {
        if landmark.location != location
            || !valid_text(&landmark.id, 64)
            || !landmark_ids.insert(landmark.id.as_str())
            || !anchors.contains(landmark.anchor_id.as_str())
            || !valid_text(&landmark.emoji, 8)
            || !valid_text(&landmark.label, 36)
            || !valid_text(&landmark.eyebrow, 36)
            || !valid_text(&landmark.description, 360)
            || !valid_percentage(&landmark.fallback_placement.left)
            || !valid_percentage(&landmark.fallback_placement.top)
        {
            return Err(format!("{location:?} has an invalid landmark"));
        }
    }
    Ok(())
}

fn validate_world(world: &TopiaWorldConfig) -> Result<(), String> {
    if world.schema_version != 1
        || !valid_text(&world.id, 80)
        || !valid_text(&world.owner_id, 80)
        || world.revision == 0
        || !matches!(world.source.as_str(), "mock" | "cloud")
        || !valid_text(&world.profile.home_name, 48)
        || !valid_text(&world.profile.archetype, 100)
        || world
            .profile
            .accent_colors
            .iter()
            .any(|color| *color > 0x00ff_ffff)
    {
        return Err("invalid Topia world metadata".into());
    }
    validate_scene(&world.scenes.exterior, TopiaLocation::Exterior)?;
    validate_scene(&world.scenes.interior, TopiaLocation::Interior)?;
    validate_scene(&world.scenes.garden, TopiaLocation::Garden)?;
    Ok(())
}

fn parse_world(value: &str) -> Result<TopiaWorldConfig, String> {
    let trimmed = value.trim();
    let without_opening = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim();
    let without_fence = without_opening
        .strip_suffix("```")
        .unwrap_or(without_opening)
        .trim();
    let json = match serde_json::from_str::<Value>(without_fence) {
        Ok(value) => value,
        Err(_) => {
            let start = without_fence
                .find('{')
                .ok_or_else(|| "cloud did not return Topia JSON".to_string())?;
            let end = without_fence
                .rfind('}')
                .filter(|end| *end > start)
                .ok_or_else(|| "cloud did not return complete Topia JSON".to_string())?;
            serde_json::from_str(&without_fence[start..=end]).map_err(|error| error.to_string())?
        }
    };
    let world: TopiaWorldConfig =
        serde_json::from_value(json).map_err(|error| error.to_string())?;
    validate_world(&world)?;
    Ok(world)
}

fn mock_world() -> Result<TopiaWorldConfig, String> {
    parse_world(MOCK_WORLD)
}

fn world_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(WORLD_FILE))
}

fn load_saved_world(app: &tauri::AppHandle) -> Result<TopiaWorldConfig, String> {
    let path = world_path(app)?;
    if !path.exists() {
        return mock_world();
    }
    let value = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    parse_world(&value).or_else(|_| mock_world())
}

fn persist_world(app: &tauri::AppHandle, world: &TopiaWorldConfig) -> Result<(), String> {
    validate_world(world)?;
    let value = serde_json::to_vec_pretty(world).map_err(|error| error.to_string())?;
    std::fs::write(world_path(app)?, value).map_err(|error| error.to_string())
}

fn filter_relations(world: &mut TopiaWorldConfig, context: &TopiaRuntimeContext) {
    let quest_ids: HashSet<_> = context
        .quests
        .iter()
        .map(|quest| quest.id.as_str())
        .collect();
    let person_ids: HashSet<_> = context
        .people
        .iter()
        .map(|person| person.id.as_str())
        .collect();
    let memory_ids: HashSet<_> = context
        .memories
        .iter()
        .map(|memory| memory.id.as_str())
        .collect();
    for location in [
        TopiaLocation::Exterior,
        TopiaLocation::Interior,
        TopiaLocation::Garden,
    ] {
        let scene = scene_mut(world, location);
        for object in &mut scene.objects {
            if object
                .task_id
                .as_deref()
                .is_some_and(|id| !quest_ids.contains(id))
            {
                object.task_id = None;
            }
        }
        for landmark in &mut scene.landmarks {
            landmark
                .task_ids
                .retain(|id| quest_ids.contains(id.as_str()));
            landmark
                .person_ids
                .retain(|id| person_ids.contains(id.as_str()));
            landmark
                .memory_ids
                .retain(|id| memory_ids.contains(id.as_str()));
        }
    }
}

fn payload(mut world: TopiaWorldConfig, context: &TopiaRuntimeContext) -> TopiaWorldPayload {
    let quests: HashMap<_, _> = context
        .quests
        .iter()
        .map(|quest| (quest.id.as_str(), quest))
        .collect();
    let crop_names = ["sunflower", "tomato", "lavender", "pumpkin", "herb"];
    let crops = world
        .scenes
        .garden
        .objects
        .iter()
        .filter_map(|object| {
            if object.prefab != TopiaPrefab::CropPlot {
                return None;
            }
            let quest = quests.get(object.task_id.as_deref()?)?;
            let crop = object
                .params
                .get("crop")
                .and_then(Value::as_str)
                .filter(|value| crop_names.contains(value))
                .unwrap_or("herb");
            Some(TopiaSceneCrop {
                id: quest.id.clone(),
                title: quest.title.clone(),
                progress: quest.progress,
                crop: crop.into(),
                person_id: quest.person_id.clone(),
            })
        })
        .collect();
    for landmark in &mut world.scenes.garden.landmarks {
        let Some(quest) = landmark
            .task_ids
            .iter()
            .find_map(|id| quests.get(id.as_str()))
        else {
            continue;
        };
        landmark.label = quest.title.clone();
        landmark.eyebrow = format!("任务作物 · 生长 {}%", quest.progress);
        landmark.description = if quest.progress >= 100 {
            "任务已经完成，作物成熟并结出了可以收获的果实。".into()
        } else {
            format!(
                "这株作物会随着「{}」的推进继续生长。下一次任务进展会直接反映在枝叶与果实上。",
                quest.title
            )
        };
        for memory in &context.memories {
            if memory.task_ids.contains(&quest.id) && !landmark.memory_ids.contains(&memory.id) {
                landmark.memory_ids.push(memory.id.clone());
            }
        }
    }
    TopiaWorldPayload { world, crops }
}

#[tauri::command]
pub fn load_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    Ok(payload(load_saved_world(&app)?, &context))
}

#[tauri::command]
pub fn save_topia_world(
    mut world: TopiaWorldConfig,
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    filter_relations(&mut world, &context);
    validate_world(&world)?;
    persist_world(&app, &world)?;
    Ok(payload(world, &context))
}

#[tauri::command]
pub fn reset_topia_world(
    context: TopiaRuntimeContext,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    let path = world_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(payload(mock_world()?, &context))
}

#[tauri::command]
pub fn generate_topia_world(
    input: TopiaGenerationInput,
    app: tauri::AppHandle,
) -> Result<TopiaWorldPayload, String> {
    let user_prompt = prompt::build(&input)?;
    #[cfg(mobile)]
    let response = app
        .state::<crate::mobile_cloud::RealiaCloud<tauri::Wry>>()
        .complete(crate::mobile_cloud::CompleteRequest {
            prompt: &user_prompt,
            system: Some(prompt::SYSTEM_PROMPT),
            json: true,
        })?;
    #[cfg(not(mobile))]
    {
        let _ = (input, app, user_prompt);
        return Err("Topia cloud generation is only available in the Android app".into());
    }
    #[cfg(mobile)]
    {
        let mut world = parse_world(&response.text)?;
        filter_relations(&mut world, &input.context);
        world.source = "cloud".into();
        world.generated_at = Utc::now().to_rfc3339();
        world.generation = Some(TopiaGenerationMetadata {
            provider: response.provider,
            model: response.model,
            prompt_version: prompt::PROMPT_VERSION.into(),
        });
        validate_world(&world)?;
        persist_world(&app, &world)?;
        Ok(payload(world, &input.context))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_mock_is_a_complete_valid_world() {
        let world = mock_world().expect("mock world should parse");
        assert_eq!(world.schema_version, 1);
        assert!(world.scenes.exterior.objects.len() >= 8);
        assert!(world.scenes.interior.objects.len() >= 8);
        assert!(world.scenes.garden.objects.len() >= 8);
    }

    #[test]
    fn prompt_describes_all_personal_world_views() {
        let input = TopiaGenerationInput {
            profile: TopiaUserProfileInput {
                display_name: Some("测试用户".into()),
                summary: "喜欢植物与星空".into(),
                traits: vec!["好奇".into()],
                experiences: vec!["旧温室".into()],
                preferences: vec!["温暖".into()],
            },
            context: TopiaRuntimeContext::default(),
        };
        let value = prompt::build(&input).expect("prompt should serialize");
        assert!(value.contains("FLOATING HOME"));
        assert!(value.contains("PERSONAL ROOM"));
        assert!(value.contains("TASK LAND"));
        assert!(value.contains("测试用户"));
        assert!(value.contains("Return JSON only"));
    }

    #[test]
    fn rejects_landmarks_without_scene_anchors() {
        let mut world = mock_world().expect("mock world should parse");
        world.scenes.exterior.landmarks[0].anchor_id = "missing-anchor".into();
        assert!(validate_world(&world).is_err());
    }

    #[test]
    fn runtime_payload_hydrates_task_crops() {
        let world = mock_world().expect("mock world should parse");
        let context = TopiaRuntimeContext {
            quests: vec![TopiaQuestContext {
                id: "app".into(),
                title: "完成动态世界".into(),
                progress: 68,
                person_id: None,
                priority: None,
                category: None,
                status: None,
                reward: None,
            }],
            ..TopiaRuntimeContext::default()
        };
        let resolved = payload(world, &context);
        assert_eq!(resolved.crops.len(), 1);
        assert_eq!(resolved.crops[0].progress, 68);
        assert!(resolved
            .world
            .scenes
            .garden
            .landmarks
            .iter()
            .any(|landmark| {
                landmark.label == "完成动态世界" && landmark.eyebrow.contains("68%")
            }));
    }

    #[test]
    fn relation_filter_removes_model_invented_ids() {
        let mut world = mock_world().expect("mock world should parse");
        let landmark = &mut world.scenes.exterior.landmarks[0];
        landmark.task_ids = vec!["known-task".into(), "invented-task".into()];
        landmark.person_ids = vec!["known-person".into(), "invented-person".into()];
        landmark.memory_ids = vec!["known-memory".into(), "invented-memory".into()];
        let context = TopiaRuntimeContext {
            quests: vec![TopiaQuestContext {
                id: "known-task".into(),
                title: "真实任务".into(),
                progress: 10,
                person_id: None,
                priority: None,
                category: None,
                status: None,
                reward: None,
            }],
            people: vec![TopiaPersonContext {
                id: "known-person".into(),
                name: "真实人物".into(),
                role: "朋友".into(),
                affinity: 50,
            }],
            memories: vec![TopiaMemoryContext {
                id: "known-memory".into(),
                title: "真实记忆".into(),
                meta: "测试".into(),
                summary: None,
                person_ids: vec![],
                task_ids: vec![],
                mood: None,
                intensity: None,
            }],
        };
        filter_relations(&mut world, &context);
        let landmark = &world.scenes.exterior.landmarks[0];
        assert_eq!(landmark.task_ids, ["known-task"]);
        assert_eq!(landmark.person_ids, ["known-person"]);
        assert_eq!(landmark.memory_ids, ["known-memory"]);
    }
}
